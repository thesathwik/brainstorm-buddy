import { SummonResult, SummonContext, ResponseType, QuestionType } from '../models/SummonDetection';
import { SummonType, ActivityLevel } from '../models/Enums';
import { ChatMessage } from '../models/ChatMessage';
import { ConversationContext } from '../models/ConversationContext';
import { GeminiApiClient } from '../api/GeminiApiClient';
import { ManualControlManager } from './ManualControlManager';
import { SummonContextAnalyzer, DefaultSummonContextAnalyzer } from './SummonContextAnalyzer';

export interface SummonResponse {
  shouldRespond: boolean;
  response: string;
  requiresClarification: boolean;
  activityLevelChanged?: ActivityLevel;
  followUpActions?: string[];
  responseType?: ResponseType;
  summonContext?: SummonContext;
}

export interface SummonResponseHandler {
  handleSummon(
    summonResult: SummonResult,
    message: ChatMessage,
    context: ConversationContext
  ): Promise<SummonResponse>;
  
  generateClarificationRequest(
    summonResult: SummonResult,
    context: ConversationContext
  ): Promise<string>;
}

export class DefaultSummonResponseHandler implements SummonResponseHandler {
  private geminiClient: GeminiApiClient;
  private manualControlManager: ManualControlManager;
  private contextAnalyzer: SummonContextAnalyzer;

  constructor(
    geminiClient: GeminiApiClient,
    manualControlManager: ManualControlManager,
    contextAnalyzer?: SummonContextAnalyzer
  ) {
    this.geminiClient = geminiClient;
    this.manualControlManager = manualControlManager;
    this.contextAnalyzer = contextAnalyzer || new DefaultSummonContextAnalyzer(geminiClient);
  }

  async handleSummon(
    summonResult: SummonResult,
    message: ChatMessage,
    context: ConversationContext
  ): Promise<SummonResponse> {
    
    switch (summonResult.summonType) {
      case SummonType.ACTIVITY_CONTROL:
        return this.handleActivityControl(summonResult, message);
      
      case SummonType.BOT_MENTION:
        return this.handleBotMention(summonResult, message, context);
      
      case SummonType.HELP_REQUEST:
        return this.handleHelpRequest(summonResult, message, context);
      
      case SummonType.TRIGGER_PHRASE:
        return this.handleTriggerPhrase(summonResult, message, context);
      
      default:
        return {
          shouldRespond: false,
          response: '',
          requiresClarification: false
        };
    }
  }

  async generateClarificationRequest(
    summonResult: SummonResult,
    context: ConversationContext
  ): Promise<string> {
    const prompt = `Generate a brief, professional clarification request for a VC brainstorming bot. 
    The user summoned the bot but their request was unclear.
    
    Summon type: ${summonResult.summonType}
    Extracted request: "${summonResult.extractedRequest || 'unclear'}"
    Current topic: ${context.currentTopic}
    
    Ask what specific help they need. Keep it concise and professional.
    Examples: "What specific information can I help you with?" or "How can I assist with this discussion?"`;

    try {
      const response = await this.geminiClient.analyzeText('', prompt);
      return response.content || "How can I help you with this discussion?";
    } catch (error) {
      return "How can I help you with this discussion?";
    }
  }

  private async handleActivityControl(
    summonResult: SummonResult,
    message: ChatMessage
  ): Promise<SummonResponse> {
    
    if (!summonResult.activityLevelChange) {
      return {
        shouldRespond: false,
        response: '',
        requiresClarification: false
      };
    }

    // Update the activity level
    this.manualControlManager.setActivityLevel(
      message.userId,
      summonResult.activityLevelChange,
      `User request: ${summonResult.triggerPhrase}`
    );

    const response = this.generateActivityControlResponse(summonResult.activityLevelChange);

    return {
      shouldRespond: true,
      response,
      requiresClarification: false,
      activityLevelChanged: summonResult.activityLevelChange,
      followUpActions: ['return_to_monitoring']
    };
  }

  private async handleBotMention(
    summonResult: SummonResult,
    message: ChatMessage,
    context: ConversationContext
  ): Promise<SummonResponse> {
    
    // Analyze the summon context to determine response strategy
    const summonContext = await this.contextAnalyzer.analyzeSummonContext(
      summonResult, 
      message, 
      context
    );
    
    const responseType = this.contextAnalyzer.determineResponseType(summonContext);
    
    let response: string;
    let requiresClarification = false;
    
    switch (responseType) {
      case ResponseType.DIRECT_ANSWER:
        response = await this.generateDirectResponse(summonResult, summonContext, context);
        break;
        
      case ResponseType.CLARIFICATION_NEEDED:
        response = await this.generateIntelligentClarification(summonContext, context);
        requiresClarification = true;
        break;
        
      case ResponseType.INFORMATION_REQUEST:
        response = await this.generateInformationResponse(summonResult, summonContext, context);
        break;
        
      case ResponseType.ACKNOWLEDGMENT:
        response = this.generateAcknowledgment(summonContext);
        break;
        
      default:
        response = await this.generateContextualResponse(
          summonResult.extractedRequest || message.content, 
          context
        );
    }
    
    return {
      shouldRespond: true,
      response,
      requiresClarification,
      followUpActions: requiresClarification ? [] : ['return_to_monitoring'],
      responseType,
      summonContext
    };
  }

  private async handleHelpRequest(
    summonResult: SummonResult,
    message: ChatMessage,
    context: ConversationContext
  ): Promise<SummonResponse> {
    
    const extractedRequest = summonResult.extractedRequest || message.content;
    
    // Generate helpful response based on the request and context
    const response = await this.generateHelpResponse(extractedRequest, context);
    
    return {
      shouldRespond: true,
      response,
      requiresClarification: false,
      followUpActions: ['return_to_monitoring']
    };
  }

  private async handleTriggerPhrase(
    summonResult: SummonResult,
    message: ChatMessage,
    context: ConversationContext
  ): Promise<SummonResponse> {
    
    const extractedRequest = summonResult.extractedRequest || message.content;
    
    // Generate response based on the trigger phrase and context
    const response = await this.generateTriggerResponse(
      summonResult.triggerPhrase || '',
      extractedRequest,
      context
    );
    
    return {
      shouldRespond: true,
      response,
      requiresClarification: false,
      followUpActions: ['return_to_monitoring']
    };
  }

  private generateActivityControlResponse(activityLevel: ActivityLevel): string {
    switch (activityLevel) {
      case ActivityLevel.SILENT:
        return "I'll stay silent now. Mention me directly if you need help.";
      
      case ActivityLevel.QUIET:
        return "I'll be less active and only speak up when really necessary.";
      
      case ActivityLevel.NORMAL:
        return "I'm back to normal activity level.";
      
      case ActivityLevel.ACTIVE:
        return "I'll be more proactive in providing input and suggestions.";
      
      default:
        return "Activity level updated.";
    }
  }

  private async generateContextualResponse(
    request: string,
    context: ConversationContext
  ): Promise<string> {
    
    const prompt = `You are a proactive AI assistant for VC brainstorming sessions. 
    A user has directly asked you: "${request}"
    
    Current discussion context:
    - Topic: ${context.currentTopic}
    - Meeting type: ${context.meetingType}
    - Participants: ${context.participants.length} people
    
    Provide a helpful, concise response that addresses their request while being relevant to the VC context.
    Keep it professional but conversational. If you need more information, ask specific questions.`;

    try {
      const response = await this.geminiClient.analyzeText(request, prompt);
      return response.content || "I'm here to help. Could you be more specific about what you need?";
    } catch (error) {
      return "I'm here to help. Could you be more specific about what you need?";
    }
  }

  private async generateHelpResponse(
    request: string,
    context: ConversationContext
  ): Promise<string> {
    
    const prompt = `You are a proactive AI assistant for VC brainstorming sessions.
    A user is asking for help: "${request}"
    
    Current context:
    - Topic: ${context.currentTopic}
    - Meeting type: ${context.meetingType}
    
    Provide specific help based on their request. If the request is vague, offer concrete ways you can assist:
    - Market research and data
    - Company analysis
    - Investment evaluation
    - Fact-checking
    - Discussion facilitation
    
    Be helpful and specific about what you can do.`;

    try {
      const response = await this.geminiClient.analyzeText(request, prompt);
      return response.content || this.getDefaultHelpResponse();
    } catch (error) {
      return this.getDefaultHelpResponse();
    }
  }

  private async generateTriggerResponse(
    triggerPhrase: string,
    fullRequest: string,
    context: ConversationContext
  ): Promise<string> {
    
    const prompt = `You are a proactive AI assistant for VC brainstorming sessions.
    A user used the trigger phrase "${triggerPhrase}" in this message: "${fullRequest}"
    
    Current context:
    - Topic: ${context.currentTopic}
    - Meeting type: ${context.meetingType}
    
    Respond appropriately to their implied request. Common trigger phrases mean:
    - "what do you think" = provide analysis or opinion
    - "bot input" = provide relevant information or suggestions
    - "need assistance" = offer specific help
    
    Provide a relevant, helpful response.`;

    try {
      const response = await this.geminiClient.analyzeText(fullRequest, prompt);
      return response.content || "I'm ready to help. What would you like me to focus on?";
    } catch (error) {
      return "I'm ready to help. What would you like me to focus on?";
    }
  }

  private async generateDirectResponse(
    summonResult: SummonResult,
    summonContext: SummonContext,
    context: ConversationContext
  ): Promise<string> {
    const extractedRequest = summonResult.extractedRequest || '';
    
    const prompt = `You are a proactive AI assistant for VC brainstorming sessions. 
    A user has asked: "${extractedRequest}"
    
    Intent: ${summonContext.extractedIntent}
    Question type: ${summonContext.questionType}
    Context: ${context.currentTopic}
    
    Provide a direct, helpful response. Do NOT ask "what do you need" or echo their words.
    Be confident and specific. If you need more information, ask targeted questions.
    
    Examples of good responses:
    - "Based on current market trends, Series A valuations in fintech are averaging..."
    - "For due diligence on SaaS companies, focus on these key metrics..."
    - "That company's revenue growth looks strong at 40% YoY, but consider..."
    
    Avoid robotic phrases like "Based on your question about..." or "According to your request..."`;

    try {
      const response = await this.geminiClient.analyzeText(extractedRequest, prompt);
      return response.content || this.getFallbackDirectResponse(summonContext);
    } catch (error) {
      return this.getFallbackDirectResponse(summonContext);
    }
  }

  private async generateIntelligentClarification(
    summonContext: SummonContext,
    context: ConversationContext
  ): Promise<string> {
    // Generate specific clarification based on what we detected
    if (summonContext.questionType === QuestionType.UNCLEAR_REQUEST) {
      return this.generateSpecificClarificationPrompts(context);
    }
    
    if (summonContext.questionClarity < 0.3) {
      return `I'd like to help, but could you be more specific? For example:
• Are you looking for market data or company analysis?
• Do you need help with financial modeling or due diligence?
• Would you like my opinion on the current discussion?`;
    }
    
    // For partially clear requests, ask targeted questions
    const prompt = `Generate a brief, targeted clarification question for a VC brainstorming bot.
    
    User intent: ${summonContext.extractedIntent}
    Question type: ${summonContext.questionType}
    Current topic: ${context.currentTopic}
    Clarity score: ${summonContext.questionClarity}
    
    Ask a specific follow-up question to clarify their exact need. Keep it concise and professional.
    Examples: "Which aspect of the valuation model?" or "Are you looking for market size or growth projections?"`;

    try {
      const response = await this.geminiClient.analyzeText('', prompt);
      return response.content || "Could you clarify what specific information you need?";
    } catch (error) {
      return "Could you clarify what specific information you need?";
    }
  }

  private async generateInformationResponse(
    summonResult: SummonResult,
    summonContext: SummonContext,
    context: ConversationContext
  ): Promise<string> {
    const extractedRequest = summonResult.extractedRequest || '';
    
    const prompt = `You are a VC brainstorming assistant. The user is requesting information: "${extractedRequest}"
    
    Intent: ${summonContext.extractedIntent}
    Current topic: ${context.currentTopic}
    
    Provide relevant information or explain how you can help gather it.
    Be specific about what data you can provide or what research you can do.
    
    Examples:
    - "I can pull the latest market data for that sector. The current market size is..."
    - "For competitive analysis, I'll need to research their main competitors..."
    - "Here's what I found about their recent funding rounds..."`;

    try {
      const response = await this.geminiClient.analyzeText(extractedRequest, prompt);
      return response.content || `I can help gather that information. Let me research ${summonContext.extractedIntent} for you.`;
    } catch (error) {
      return `I can help gather that information. Let me research ${summonContext.extractedIntent} for you.`;
    }
  }

  private generateAcknowledgment(summonContext: SummonContext): string {
    if (summonContext.questionType === QuestionType.GREETING) {
      const greetings = [
        "Hello! I'm here to help with your VC discussion.",
        "Hi there! Ready to assist with investment analysis.",
        "Good to hear from you! How can I support the discussion?",
        "Hello! What can I help you with today?"
      ];
      return greetings[Math.floor(Math.random() * greetings.length)];
    }
    
    return "I'm here and ready to help. What would you like to focus on?";
  }

  private getFallbackDirectResponse(summonContext: SummonContext): string {
    switch (summonContext.questionType) {
      case QuestionType.DIRECT_QUESTION:
        return "I'd be happy to help answer that. Could you provide a bit more context about what specific information you're looking for?";
      
      case QuestionType.OPINION_REQUEST:
        return "I can share my analysis on that. What specific aspect would you like my perspective on?";
      
      case QuestionType.INFORMATION_REQUEST:
        return `I can help gather information about ${summonContext.extractedIntent}. What specific data points are you interested in?`;
      
      case QuestionType.HELP_REQUEST:
        return `I'm ready to assist with ${summonContext.extractedIntent}. What's the specific challenge you're facing?`;
      
      default:
        return "I'm here to help. Could you clarify what specific assistance you need?";
    }
  }

  private generateSpecificClarificationPrompts(context: ConversationContext): string {
    const currentTopic = context.currentTopic || 'your discussion';
    
    return `I'd like to help with ${currentTopic}. What specifically can I assist with?

• Market research and competitive analysis
• Company financials and valuation models  
• Due diligence questions and risk assessment
• Investment thesis development
• Deal structure and terms analysis

What area interests you most?`;
  }

  private getDefaultHelpResponse(): string {
    return `I can help with:
• Market research and competitive analysis
• Company information and financial data
• Investment evaluation and due diligence
• Fact-checking claims and statements
• Keeping discussions on track
• Providing relevant context and insights

What specific area would you like assistance with?`;
  }
}