import { CommunicationStyle, MeetingType } from '../models/Enums';
import { Participant } from '../models/UserPreferences';

export interface RoboticPhrase {
  pattern: RegExp;
  description: string;
  severity: 'low' | 'medium' | 'high';
  replacement?: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  professionalScore: number; // 0-1 score
}

export interface CommunicationQuality {
  naturalness: number; // 0-1 score
  professionalism: number; // 0-1 score
  clarity: number; // 0-1 score
  engagement: number; // 0-1 score
  overallScore: number; // 0-1 score
}

export interface ResponseAdapter {
  adaptToMeetingContext(response: string, meetingType: MeetingType): string;
  adjustForParticipantRoles(response: string, participants: Participant[]): string;
  maintainConversationalFlow(response: string, conversationTone: CommunicationStyle): string;
}

export class CommunicationFilter implements ResponseAdapter {
  private static readonly ROBOTIC_PATTERNS: RoboticPhrase[] = [
    {
      pattern: /^Based on your question about[^,]*,\s*/i,
      description: 'Robotic opening phrase',
      severity: 'high',
      replacement: ''
    },
    {
      pattern: /^According to your request[^,]*,\s*/i,
      description: 'Formal robotic opening',
      severity: 'high',
      replacement: ''
    },
    {
      pattern: /^As per your inquiry[^,]*,\s*/i,
      description: 'Overly formal opening',
      severity: 'high',
      replacement: ''
    },
    {
      pattern: /^In response to your question about[^,]*,\s*/i,
      description: 'Verbose robotic opening',
      severity: 'high',
      replacement: ''
    },
    {
      pattern: /What do you need\?$/i,
      description: 'Generic response to summons',
      severity: 'medium',
      replacement: ''
    },
    {
      pattern: /^Based on your question,\s*/i,
      description: 'Simple robotic opening',
      severity: 'high',
      replacement: ''
    },
    {
      pattern: /^I understand that you[^.!?]*\.\s*/i,
      description: 'Robotic acknowledgment',
      severity: 'medium',
      replacement: ''
    },
    {
      pattern: /^Thank you for your question about[^.!?]*\.\s*/i,
      description: 'Unnecessary gratitude phrase',
      severity: 'medium',
      replacement: ''
    },
    {
      pattern: /I hope this helps\.?\s*$/i,
      description: 'Generic closing phrase',
      severity: 'low',
      replacement: ''
    },
    {
      pattern: /^Please let me know if you need[^.!?]*\.\s*/i,
      description: 'Generic offer for help',
      severity: 'low',
      replacement: ''
    },
    {
      pattern: /I can provide the following[^.!?]*\.\s*/i,
      description: 'Generic information offer',
      severity: 'medium',
      replacement: ''
    },
    {
      pattern: /Based on your inquiry[^,]*,\s*/i,
      description: 'Robotic inquiry response',
      severity: 'high',
      replacement: ''
    }
  ];

  private static readonly UNPROFESSIONAL_PATTERNS: RegExp[] = [
    /\b(um|uh|like|you know)\b/gi,
    /\b(gonna|wanna|gotta)\b/gi,
    /\b(yeah|yep|nope)\b/gi,
    /!{2,}/g, // Multiple exclamation marks
    /\?{2,}/g, // Multiple question marks
    /\b(awesome|cool|sweet)\b/gi
  ];

  private static readonly EXECUTIVE_VOCABULARY: Map<string, string> = new Map([
    ['awesome', 'excellent'],
    ['cool', 'interesting'],
    ['sweet', 'favorable'],
    ['yeah', 'yes'],
    ['yep', 'yes'],
    ['nope', 'no'],
    ['gonna', 'going to'],
    ['wanna', 'want to'],
    ['gotta', 'need to']
  ]);

  /**
   * Detects robotic phrases in the given text
   */
  public detectRoboticPhrases(text: string): RoboticPhrase[] {
    const detectedPhrases: RoboticPhrase[] = [];
    
    for (const phrase of CommunicationFilter.ROBOTIC_PATTERNS) {
      if (phrase.pattern.test(text)) {
        detectedPhrases.push(phrase);
      }
    }
    
    return detectedPhrases;
  }

  /**
   * Removes echoing patterns where the bot repeats user input verbatim
   */
  public removeEchoingPatterns(text: string, userInput: string): string {
    if (!userInput || userInput.length < 10) {
      return text;
    }

    // Extract key phrases from user input (3+ words)
    const userPhrases = this.extractKeyPhrases(userInput);
    let cleanedText = text;

    for (const phrase of userPhrases) {
      // Remove exact matches of user phrases
      const exactMatch = new RegExp(`\\b${this.escapeRegex(phrase)}\\b`, 'gi');
      cleanedText = cleanedText.replace(exactMatch, '');
      
      // Remove phrases that start with user input
      const startingMatch = new RegExp(`^[^.!?]*${this.escapeRegex(phrase)}[^.!?]*[.!?]`, 'gi');
      cleanedText = cleanedText.replace(startingMatch, '');
    }

    // Clean up any resulting double spaces or awkward punctuation
    cleanedText = cleanedText
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.!?])/g, '$1')
      .replace(/^[.!?\s]+/, '')
      .trim();

    return cleanedText;
  }

  /**
   * Enhances natural flow by improving sentence structure and transitions
   */
  public enhanceNaturalFlow(text: string): string {
    let enhanced = text;

    // Remove robotic phrases first
    const roboticPhrases = this.detectRoboticPhrases(enhanced);
    for (const phrase of roboticPhrases) {
      enhanced = enhanced.replace(phrase.pattern, phrase.replacement || '');
    }

    // Improve sentence flow
    enhanced = this.improveSentenceFlow(enhanced);
    
    // Add natural transitions
    enhanced = this.addNaturalTransitions(enhanced);
    
    // Clean up spacing and punctuation
    enhanced = enhanced
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.!?])/g, '$1')
      .trim();

    return enhanced;
  }

  /**
   * Validates and enhances text for executive-level business language
   */
  public validateBusinessLanguage(text: string): ValidationResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let professionalScore = 1.0;

    // Check for unprofessional language
    for (const pattern of CommunicationFilter.UNPROFESSIONAL_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        issues.push(`Unprofessional language detected: ${matches.join(', ')}`);
        suggestions.push('Replace casual language with professional alternatives');
        professionalScore -= 0.2;
      }
    }

    // Check for robotic phrases
    const roboticPhrases = this.detectRoboticPhrases(text);
    if (roboticPhrases.length > 0) {
      issues.push(`Robotic phrases detected: ${roboticPhrases.length} instances`);
      suggestions.push('Remove robotic opening and closing phrases');
      professionalScore -= roboticPhrases.length * 0.15;
    }

    // Check sentence length (too long or too short)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    
    if (avgLength > 150) {
      issues.push('Sentences are too long for executive communication');
      suggestions.push('Break down complex sentences into shorter, clearer statements');
      professionalScore -= 0.1;
    } else if (avgLength < 20 && sentences.length > 1) {
      issues.push('Sentences are too short and choppy');
      suggestions.push('Combine related ideas into more substantial sentences');
      professionalScore -= 0.1;
    }

    // Check for confidence indicators
    if (text.includes('I think') || text.includes('maybe') || text.includes('perhaps')) {
      issues.push('Language lacks confidence for executive setting');
      suggestions.push('Use more definitive language appropriate for business decisions');
      professionalScore -= 0.15;
    }

    professionalScore = Math.max(0, professionalScore);

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
      professionalScore
    };
  }

  /**
   * Ensures professional tone throughout the response
   */
  public ensureProfessionalTone(response: string): string {
    let professional = response;

    // Replace casual words with professional alternatives
    for (const [casual, professional_word] of CommunicationFilter.EXECUTIVE_VOCABULARY) {
      const pattern = new RegExp(`\\b${casual}\\b`, 'gi');
      professional = professional.replace(pattern, professional_word);
    }

    // Remove unprofessional patterns
    for (const pattern of CommunicationFilter.UNPROFESSIONAL_PATTERNS) {
      professional = professional.replace(pattern, '');
    }

    // Ensure confident language
    professional = professional
      .replace(/\bI think\b/gi, 'The analysis indicates')
      .replace(/\bmaybe\b/gi, 'potentially')
      .replace(/\bperhaps\b/gi, 'likely')
      .replace(/\bmight be\b/gi, 'appears to be');

    // Clean up any resulting issues
    professional = professional
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.!?])/g, '$1')
      .trim();

    return professional;
  }

  /**
   * Removes robotic phrases from text
   */
  public removeRoboticPhrases(response: string): string {
    let cleaned = response;

    for (const phrase of CommunicationFilter.ROBOTIC_PATTERNS) {
      cleaned = cleaned.replace(phrase.pattern, phrase.replacement || '');
    }

    // Clean up any resulting spacing issues
    cleaned = cleaned
      .replace(/^\s*[,.]?\s*/, '') // Remove leading punctuation
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.!?])/g, '$1')
      .trim();

    // If the result is empty or just punctuation, return empty string
    if (!cleaned || cleaned.match(/^[.!?\s]*$/)) {
      return '';
    }

    // Ensure the response starts with a capital letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned;
  }

  /**
   * Adapts response to meeting context
   */
  public adaptToMeetingContext(response: string, meetingType: MeetingType): string {
    let adapted = response;

    switch (meetingType) {
      case MeetingType.INVESTMENT_REVIEW:
        adapted = this.addInvestmentContext(adapted);
        break;
      case MeetingType.DUE_DILIGENCE:
        adapted = this.addAnalyticalTone(adapted);
        break;
      case MeetingType.STRATEGY_SESSION:
        adapted = this.addStrategicFraming(adapted);
        break;
      case MeetingType.PORTFOLIO_UPDATE:
        adapted = this.addPerformanceFocus(adapted);
        break;
      default:
        // Keep general business tone
        break;
    }

    return adapted;
  }

  /**
   * Adjusts response based on participant roles
   */
  public adjustForParticipantRoles(response: string, participants: Participant[]): string {
    const hasPartners = participants.some(p => p.role === 'partner');
    const hasEntrepreneurs = participants.some(p => p.role === 'entrepreneur');

    let adjusted = response;

    if (hasPartners && hasEntrepreneurs) {
      // Mixed audience - use balanced, diplomatic language
      adjusted = this.addDiplomaticTone(adjusted);
    } else if (hasPartners) {
      // Partner-heavy - use strategic, high-level language
      adjusted = this.addExecutiveTone(adjusted);
    } else if (hasEntrepreneurs) {
      // Entrepreneur-focused - use supportive, constructive language
      adjusted = this.addSupportiveTone(adjusted);
    }

    return adjusted;
  }

  /**
   * Maintains conversational flow based on communication style
   */
  public maintainConversationalFlow(response: string, conversationTone: CommunicationStyle): string {
    let flowing = response;

    switch (conversationTone) {
      case CommunicationStyle.FORMAL:
        flowing = this.addFormalStructure(flowing);
        break;
      case CommunicationStyle.CONVERSATIONAL:
        flowing = this.addConversationalElements(flowing);
        break;
      case CommunicationStyle.BRIEF:
        flowing = this.makeConcise(flowing);
        break;
      case CommunicationStyle.DETAILED:
        flowing = this.addSupportingDetail(flowing);
        break;
    }

    return flowing;
  }

  /**
   * Evaluates overall communication quality
   */
  public evaluateCommunicationQuality(text: string, userInput?: string): CommunicationQuality {
    const validation = this.validateBusinessLanguage(text);
    const roboticPhrases = this.detectRoboticPhrases(text);
    
    // Calculate naturalness (inverse of robotic phrases)
    const naturalness = Math.max(0, 1 - (roboticPhrases.length * 0.4));
    
    // Professionalism from validation
    const professionalism = validation.professionalScore;
    
    // Clarity based on sentence structure
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgLength = sentences.length > 0 ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length : 0;
    const clarity = avgLength > 20 && avgLength < 150 ? 1.0 : 0.8;
    
    // Engagement based on active voice and directness
    const hasActiveVoice = !text.includes(' was ') && !text.includes(' were ');
    const engagement = hasActiveVoice ? 0.9 : 0.6;
    
    const overallScore = (naturalness + professionalism + clarity + engagement) / 4;

    return {
      naturalness,
      professionalism,
      clarity,
      engagement,
      overallScore
    };
  }

  // Private helper methods

  private extractKeyPhrases(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const phrases: string[] = [];

    // Extract 3-5 word phrases
    for (let i = 0; i <= words.length - 3; i++) {
      const phrase = words.slice(i, i + 3).join(' ');
      if (phrase.length > 10) {
        phrases.push(phrase);
      }
    }

    return phrases;
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private improveSentenceFlow(text: string): string {
    return text
      .replace(/\. And /g, ', and ')
      .replace(/\. But /g, ', but ')
      .replace(/\. However /g, '. However, ')
      .replace(/\. Therefore /g, '. Therefore, ');
  }

  private addNaturalTransitions(text: string): string {
    const sentences = text.split(/\. /).filter(s => s.trim().length > 0);
    if (sentences.length < 2) return text;

    // Add transitions between sentences when appropriate
    const transitions = ['Additionally', 'Furthermore', 'Moreover', 'In fact'];
    let enhanced = sentences[0];

    for (let i = 1; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (Math.random() < 0.3 && !sentence.match(/^(However|Therefore|Additionally|Furthermore|Moreover|In fact)/)) {
        const transition = transitions[Math.floor(Math.random() * transitions.length)];
        enhanced += `. ${transition}, ${sentence.toLowerCase()}`;
      } else {
        enhanced += `. ${sentence}`;
      }
    }

    return enhanced;
  }

  private addInvestmentContext(text: string): string {
    return text.replace(/\bcompany\b/gi, 'portfolio company')
      .replace(/\bmarket\b/gi, 'investment market');
  }

  private addAnalyticalTone(text: string): string {
    return text.replace(/\bshows\b/gi, 'indicates')
      .replace(/\bgood\b/gi, 'favorable')
      .replace(/\bbad\b/gi, 'concerning');
  }

  private addStrategicFraming(text: string): string {
    return text.replace(/\bproblem\b/gi, 'strategic challenge')
      .replace(/\bsolution\b/gi, 'strategic approach');
  }

  private addPerformanceFocus(text: string): string {
    return text.replace(/\bresults\b/gi, 'performance metrics')
      .replace(/\bgrowth\b/gi, 'performance growth');
  }

  private addDiplomaticTone(text: string): string {
    return text.replace(/\bwrong\b/gi, 'suboptimal')
      .replace(/\bfailed\b/gi, 'did not achieve expected results');
  }

  private addExecutiveTone(text: string): string {
    return text.replace(/\bwe should\b/gi, 'the strategic approach would be to')
      .replace(/\bwe need\b/gi, 'it would be advisable to');
  }

  private addSupportiveTone(text: string): string {
    return text.replace(/\bproblems\b/gi, 'opportunities for improvement')
      .replace(/\bproblem\b/gi, 'opportunity for improvement')
      .replace(/\bmistakes\b/gi, 'learning opportunities')
      .replace(/\bmistake\b/gi, 'learning opportunity');
  }

  private addFormalStructure(text: string): string {
    if (!text.includes('In summary') && !text.includes('To conclude')) {
      return `${text} In summary, this analysis provides the necessary context for informed decision-making.`;
    }
    return text;
  }

  private addConversationalElements(text: string): string {
    return text.replace(/^/, 'Looking at this situation, ')
      .replace(/\.$/, '. What are your thoughts on this approach?');
  }

  private makeConcise(text: string): string {
    return text
      .replace(/\bin order to\b/gi, 'to')
      .replace(/\bdue to the fact that\b/gi, 'because')
      .replace(/\bat this point in time\b/gi, 'now')
      .split('. ')[0] + '.'; // Take only first sentence
  }

  private addSupportingDetail(text: string): string {
    return `${text} This assessment is based on current market conditions and industry best practices.`;
  }
}