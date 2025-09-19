import { GeminiApiClient } from '../api/GeminiApiClient';
import { ResilientGeminiApiClient } from '../api/ResilientGeminiApiClient';
import { 
  InterventionType, 
  CommunicationStyle, 
  VCRole, 
  InformationType 
} from '../models/Enums';
import { ConversationContext } from '../models/ConversationContext';
import { UserPreferences } from '../models/UserPreferences';
import { GracefulDegradationService, ConflictResolution } from './GracefulDegradationService';
import { globalErrorHandler, ErrorContext } from './ErrorHandler';

export interface BotResponse {
  content: string;
  type: InterventionType;
  confidence: number;
  sources?: Source[];
  followUpSuggestions?: string[];
}

export interface Source {
  type: 'api' | 'knowledge_base' | 'calculation';
  description: string;
  url?: string;
  timestamp: Date;
}

export interface ConversationTone {
  formality: number; // 0-1 scale (0 = casual, 1 = formal)
  urgency: number; // 0-1 scale
  enthusiasm: number; // 0-1 scale
  technicality: number; // 0-1 scale (0 = simple, 1 = technical)
}

export interface ResponseTemplate {
  type: InterventionType;
  template: string;
  placeholders: string[];
  toneAdjustments: {
    formal: string;
    conversational: string;
    brief: string;
    detailed: string;
  };
}

export interface ResponseGenerator {
  generateResponse(
    interventionType: InterventionType,
    context: ConversationContext,
    additionalData?: any
  ): Promise<BotResponse>;
  
  personalizeResponse(
    baseResponse: string,
    userPreferences: UserPreferences,
    conversationTone: ConversationTone
  ): string;
}

export class DefaultResponseGenerator implements ResponseGenerator {
  private geminiClient: GeminiApiClient;
  private resilientClient: ResilientGeminiApiClient;
  private degradationService: GracefulDegradationService;
  private responseTemplates: Map<InterventionType, ResponseTemplate>;

  constructor(geminiClient: GeminiApiClient) {
    this.geminiClient = geminiClient;
    this.resilientClient = new ResilientGeminiApiClient(geminiClient, globalErrorHandler);
    this.degradationService = new GracefulDegradationService();
    this.responseTemplates = this.initializeResponseTemplates();
  }

  async generateResponse(
    interventionType: InterventionType,
    context: ConversationContext,
    additionalData?: any
  ): Promise<BotResponse> {
    const errorContext: ErrorContext = {
      operation: 'generateResponse',
      component: 'ResponseGenerator',
      sessionId: context.sessionId,
      additionalData: { interventionType, hasAdditionalData: !!additionalData }
    };

    // Check for information conflicts before generating response
    const informationSources = this.extractInformationSources(additionalData);
    const conflict = this.degradationService.analyzeInformationConflicts(informationSources, context);
    
    if (conflict) {
      return this.degradationService.generateGracefulResponse(conflict, interventionType, context);
    }

    return await globalErrorHandler.executeWithResilience(
      async () => {
        const template = this.responseTemplates.get(interventionType);
        if (!template) {
          throw new Error(`No template found for intervention type: ${interventionType}`);
        }

        // Build context for Gemini API
        const conversationContext = this.buildConversationContext(context);
        const prompt = this.buildPrompt(interventionType, context, additionalData);

        // Generate response using resilient client
        const geminiResponse = await this.resilientClient.generateResponse(prompt, conversationContext);

        // Process and structure the response
        const botResponse: BotResponse = {
          content: geminiResponse.content,
          type: interventionType,
          confidence: geminiResponse.confidence,
          sources: this.extractSources(additionalData),
          followUpSuggestions: this.generateFollowUpSuggestions(interventionType, context)
        };

        return botResponse;
      },
      errorContext,
      'generateResponse'
    );
  }

  personalizeResponse(
    baseResponse: string,
    userPreferences: UserPreferences,
    conversationTone: ConversationTone
  ): string {
    let personalizedResponse = baseResponse;

    // Adjust for communication style
    personalizedResponse = this.adjustForCommunicationStyle(
      personalizedResponse, 
      userPreferences.communicationStyle
    );

    // Adjust for conversation tone
    personalizedResponse = this.adjustForConversationTone(
      personalizedResponse, 
      conversationTone
    );

    // Adjust for user expertise
    personalizedResponse = this.adjustForExpertise(
      personalizedResponse, 
      userPreferences.topicExpertise
    );

    return personalizedResponse;
  }

  private initializeResponseTemplates(): Map<InterventionType, ResponseTemplate> {
    const templates = new Map<InterventionType, ResponseTemplate>();

    templates.set(InterventionType.TOPIC_REDIRECT, {
      type: InterventionType.TOPIC_REDIRECT,
      template: "I notice we've moved away from {originalTopic}. Should we return to discussing {specificPoint}?",
      placeholders: ['originalTopic', 'specificPoint'],
      toneAdjustments: {
        formal: "I'd like to respectfully suggest we return our focus to {originalTopic}, specifically {specificPoint}.",
        conversational: "Hey, looks like we drifted from {originalTopic} - want to circle back to {specificPoint}?",
        brief: "Back to {originalTopic}? We were on {specificPoint}.",
        detailed: "I've noticed our discussion has shifted away from {originalTopic}. We were making good progress on {specificPoint}, and I think it would be valuable to continue that conversation."
      }
    });

    templates.set(InterventionType.INFORMATION_PROVIDE, {
      type: InterventionType.INFORMATION_PROVIDE,
      template: "I have some relevant information about {topic}: {information}",
      placeholders: ['topic', 'information'],
      toneAdjustments: {
        formal: "I'd like to provide some relevant data regarding {topic}: {information}",
        conversational: "Just found some info on {topic} that might help: {information}",
        brief: "{topic}: {information}",
        detailed: "I've gathered some comprehensive information about {topic} that may inform our discussion: {information}"
      }
    });

    templates.set(InterventionType.FACT_CHECK, {
      type: InterventionType.FACT_CHECK,
      template: "I'd like to verify that claim about {claim}. According to my sources: {verification}",
      placeholders: ['claim', 'verification'],
      toneAdjustments: {
        formal: "I'd like to respectfully fact-check the statement regarding {claim}. My research indicates: {verification}",
        conversational: "Quick fact-check on {claim} - I'm seeing: {verification}",
        brief: "Re: {claim} - {verification}",
        detailed: "I want to ensure we have accurate information about {claim}. Based on my analysis of current data: {verification}"
      }
    });

    templates.set(InterventionType.CLARIFICATION_REQUEST, {
      type: InterventionType.CLARIFICATION_REQUEST,
      template: "Could you clarify {unclear_point}? I want to make sure I understand correctly.",
      placeholders: ['unclear_point'],
      toneAdjustments: {
        formal: "I would appreciate clarification on {unclear_point} to ensure accurate understanding.",
        conversational: "Can you help me understand {unclear_point} better?",
        brief: "Clarify {unclear_point}?",
        detailed: "I'd like to request clarification on {unclear_point} to ensure I can provide the most relevant assistance and that we're all aligned on the details."
      }
    });

    templates.set(InterventionType.SUMMARY_OFFER, {
      type: InterventionType.SUMMARY_OFFER,
      template: "Would it be helpful if I summarized {discussion_area}?",
      placeholders: ['discussion_area'],
      toneAdjustments: {
        formal: "I would be pleased to provide a summary of {discussion_area} if that would be beneficial.",
        conversational: "Want me to recap {discussion_area}?",
        brief: "Summary of {discussion_area}?",
        detailed: "I've been tracking our discussion on {discussion_area} and could provide a comprehensive summary to help consolidate our key points and decisions."
      }
    });

    return templates;
  }

  private buildConversationContext(context: ConversationContext): string {
    const recentMessages = context.messageHistory.slice(-5);
    const participants = context.participants.map(p => `${p.name} (${p.role})`).join(', ');
    
    return `
Meeting Type: ${context.meetingType}
Current Topic: ${context.currentTopic}
Participants: ${participants}
Recent Messages: ${recentMessages.map(m => 
  `${m.originalMessage.userId}: ${m.originalMessage.content}`
).join('\n')}
    `.trim();
  }

  private buildPrompt(
    interventionType: InterventionType,
    context: ConversationContext,
    additionalData?: any
  ): string {
    const basePrompt = this.getBasePromptForType(interventionType);
    const contextualInfo = this.getContextualInfo(context, additionalData);
    
    return `
${basePrompt}

Context: ${contextualInfo}

Requirements:
- Be concise and professional
- Match the tone of the conversation
- Provide actionable insights
- Be respectful of all participants
- Focus on VC-relevant information

Generate an appropriate response:
    `.trim();
  }

  private getBasePromptForType(interventionType: InterventionType): string {
    switch (interventionType) {
      case InterventionType.TOPIC_REDIRECT:
        return "Generate a polite suggestion to redirect the conversation back to the main topic. Be diplomatic and provide a clear reason for the redirect.";
      
      case InterventionType.INFORMATION_PROVIDE:
        return "Provide relevant information that adds value to the current discussion. Include specific data points, metrics, or insights.";
      
      case InterventionType.FACT_CHECK:
        return "Politely fact-check a statement made in the conversation. Provide accurate information and cite sources when possible.";
      
      case InterventionType.CLARIFICATION_REQUEST:
        return "Ask for clarification on an unclear or ambiguous point. Be specific about what needs clarification.";
      
      case InterventionType.SUMMARY_OFFER:
        return "Offer to provide a summary of the discussion. Highlight key points and decisions made.";
      
      default:
        return "Generate a helpful response appropriate for a VC brainstorming session.";
    }
  }

  private getContextualInfo(context: ConversationContext, additionalData?: any): string {
    let info = `Current topic: ${context.currentTopic}\n`;
    
    if (context.agenda && context.agenda.length > 0) {
      info += `Agenda items: ${context.agenda.map(item => item.title).join(', ')}\n`;
    }
    
    if (additionalData) {
      if (additionalData.marketData) {
        info += `Market data: ${JSON.stringify(additionalData.marketData)}\n`;
      }
      if (additionalData.companyInfo) {
        info += `Company info: ${JSON.stringify(additionalData.companyInfo)}\n`;
      }
      if (additionalData.topicDrift) {
        info += `Topic drift detected: ${additionalData.topicDrift.originalTopic} -> ${additionalData.topicDrift.currentDirection}\n`;
      }
    }
    
    return info;
  }

  private extractSources(additionalData?: any): Source[] {
    const sources: Source[] = [];
    
    if (additionalData?.sources) {
      return additionalData.sources;
    }
    
    // Add default source for Gemini-generated content
    sources.push({
      type: 'api',
      description: 'Generated using Gemini AI',
      timestamp: new Date()
    });
    
    return sources;
  }

  private generateFollowUpSuggestions(
    interventionType: InterventionType,
    context: ConversationContext
  ): string[] {
    const suggestions: string[] = [];
    
    switch (interventionType) {
      case InterventionType.TOPIC_REDIRECT:
        suggestions.push("Would you like me to summarize what we've covered so far?");
        suggestions.push("Should I provide background information on this topic?");
        break;
        
      case InterventionType.INFORMATION_PROVIDE:
        suggestions.push("Would you like me to dive deeper into any of these points?");
        suggestions.push("Should I look for additional data on this topic?");
        break;
        
      case InterventionType.FACT_CHECK:
        suggestions.push("Would you like me to find more sources on this topic?");
        suggestions.push("Should I check for any recent updates to this information?");
        break;
        
      case InterventionType.CLARIFICATION_REQUEST:
        suggestions.push("I can provide examples if that would help clarify");
        suggestions.push("Would additional context be useful here?");
        break;
        
      case InterventionType.SUMMARY_OFFER:
        suggestions.push("I can also highlight key decisions made");
        suggestions.push("Would you like me to identify any action items?");
        break;
    }
    
    return suggestions;
  }

  private extractInformationSources(additionalData?: any): any[] {
    if (!additionalData) return [];
    
    const sources: any[] = [];
    
    if (additionalData.marketData) sources.push(additionalData.marketData);
    if (additionalData.companyInfo) sources.push(additionalData.companyInfo);
    if (additionalData.topicDrift) sources.push(additionalData.topicDrift);
    if (additionalData.knowledgeItems) sources.push(...additionalData.knowledgeItems);
    
    return sources;
  }

  private generateFallbackResponse(
    interventionType: InterventionType,
    context: ConversationContext,
    additionalData?: any
  ): BotResponse {
    const template = this.responseTemplates.get(interventionType);
    if (!template) {
      return {
        content: "I'd like to contribute to this discussion, but I'm having trouble generating a response right now. Please let me know if you need specific assistance.",
        type: interventionType,
        confidence: 0.3,
        sources: [{
          type: 'api',
          description: 'Emergency fallback response',
          timestamp: new Date()
        }],
        followUpSuggestions: ['Please try rephrasing your request', 'I can attempt a different approach']
      };
    }

    // Use template with basic placeholder replacement
    let content = template.toneAdjustments.conversational;
    
    // Simple placeholder replacement for fallback
    if (additionalData?.originalTopic) {
      content = content.replace('{originalTopic}', additionalData.originalTopic);
    }
    if (additionalData?.specificPoint) {
      content = content.replace('{specificPoint}', additionalData.specificPoint);
    }
    if (context.currentTopic) {
      content = content.replace('{topic}', context.currentTopic);
      content = content.replace('{discussion_area}', context.currentTopic);
    }

    // Remove any remaining placeholders
    content = content.replace(/\{[^}]+\}/g, '[information unavailable]');

    return {
      content,
      type: interventionType,
      confidence: 0.6,
      sources: [{
        type: 'api',
        description: 'Fallback template response',
        timestamp: new Date()
      }],
      followUpSuggestions: this.generateFollowUpSuggestions(interventionType, context)
    };
  }

  private adjustForCommunicationStyle(
    response: string,
    style: CommunicationStyle
  ): string {
    switch (style) {
      case CommunicationStyle.FORMAL:
        return this.makeFormal(response);
      case CommunicationStyle.CONVERSATIONAL:
        return this.makeConversational(response);
      case CommunicationStyle.BRIEF:
        return this.makeBrief(response);
      case CommunicationStyle.DETAILED:
        return this.makeDetailed(response);
      default:
        return response;
    }
  }

  private adjustForConversationTone(
    response: string,
    tone: ConversationTone
  ): string {
    let adjusted = response;

    // Adjust formality
    if (tone.formality > 0.7) {
      adjusted = this.makeFormal(adjusted);
    } else if (tone.formality < 0.3) {
      adjusted = this.makeConversational(adjusted);
    }

    // Adjust urgency
    if (tone.urgency > 0.7) {
      adjusted = `${adjusted} This seems time-sensitive.`;
    }

    // Adjust enthusiasm
    if (tone.enthusiasm > 0.7) {
      adjusted = adjusted.replace(/\.$/, '!');
    }

    return adjusted;
  }

  private adjustForExpertise(
    response: string,
    expertise: any[]
  ): string {
    // Add technical depth if user has relevant expertise
    if (expertise.length > 0) {
      // This is a simplified implementation
      // In practice, you'd adjust terminology and depth based on expertise areas
      return response;
    }
    return response;
  }

  private makeFormal(response: string): string {
    return response
      .replace(/\bI think\b/g, 'I believe')
      .replace(/\bwant to\b/g, 'would like to')
      .replace(/\bcan't\b/g, 'cannot')
      .replace(/\bwon't\b/g, 'will not')
      .replace(/\blet's\b/gi, 'let us')
      .replace(/\bhey\b/gi, 'Hello')
      .replace(/\bokay\b/gi, 'very well');
  }

  private makeConversational(response: string): string {
    return response
      .replace(/\bwould like to\b/g, 'want to')
      .replace(/\bcannot\b/g, "can't")
      .replace(/\bwill not\b/g, "won't")
      .replace(/\blet us\b/g, "let's");
  }

  private makeBrief(response: string): string {
    // Remove unnecessary words and phrases
    return response
      .replace(/\bI think that\b/g, '')
      .replace(/\bIt seems to me that\b/g, '')
      .replace(/\bIn my opinion,?\s*/g, '')
      .replace(/\bperhaps\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private makeDetailed(response: string): string {
    // This is a simplified implementation
    // In practice, you'd add more context and explanation
    return response;
  }
}