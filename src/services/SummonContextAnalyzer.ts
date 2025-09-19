import { SummonContext, QuestionType, ResponseType } from '../models/SummonDetection';
import { SummonResult } from '../models/SummonDetection';
import { ChatMessage } from '../models/ChatMessage';
import { ConversationContext } from '../models/ConversationContext';
import { GeminiApiClient } from '../api/GeminiApiClient';

export interface SummonContextAnalyzer {
  analyzeSummonContext(
    summonResult: SummonResult,
    message: ChatMessage,
    context: ConversationContext
  ): Promise<SummonContext>;
  
  determineResponseType(summonContext: SummonContext): ResponseType;
  
  extractQuestionIntent(text: string): Promise<string>;
}

export class DefaultSummonContextAnalyzer implements SummonContextAnalyzer {
  private geminiClient: GeminiApiClient;

  // Patterns that indicate clear, direct questions
  private readonly DIRECT_QUESTION_PATTERNS = [
    /\bwhat\s+(is|are|was|were|do|does|did)\b/i,
    /\bhow\s+(do|does|did|can|could|should|would|much|many)\b/i,
    /\bwhen\s+(is|are|was|were|do|does|did|will|would)\b/i,
    /\bwhere\s+(is|are|was|were|do|does|did)\b/i,
    /\bwhy\s+(is|are|was|were|do|does|did)\b/i,
    /\bwho\s+(is|are|was|were)\b/i,
    /\bwhich\s+(is|are|was|were|one|ones)\b/i,
    /\bcan\s+you\b/i,
    /\bcould\s+you\b/i,
    /\bwould\s+you\b/i,
    /\bshould\s+we\b/i,
    /\?$/
  ];

  // Patterns that indicate information requests
  private readonly INFORMATION_REQUEST_PATTERNS = [
    /\btell\s+me\s+about\b/i,
    /\bshow\s+me\b/i,
    /\bfind\s+(out|information)\b/i,
    /\blook\s+up\b/i,
    /\bget\s+(me\s+)?(data|information|details)\b/i,
    /\bprovide\s+(me\s+)?(with\s+)?\b/i,
    /\bgive\s+me\b/i,
    /\bneed\s+(to\s+)?(know|see|understand)\b/i
  ];

  // Patterns that indicate opinion requests
  private readonly OPINION_REQUEST_PATTERNS = [
    /\bwhat\s+do\s+you\s+think\b/i,
    /\byour\s+(opinion|thoughts|view|perspective)\b/i,
    /\bdo\s+you\s+(think|believe|feel)\b/i,
    /\bshould\s+(I|we)\b/i,
    /\bwould\s+you\s+(recommend|suggest)\b/i,
    /\badvice\b/i,
    /\brecommendation\b/i
  ];

  // Patterns that indicate help requests
  private readonly HELP_REQUEST_PATTERNS = [
    /\bhelp\s+(me|us|with)\b/i,
    /\bassist\s+(me|us|with)\b/i,
    /\bsupport\b/i,
    /\bguide\s+(me|us)\b/i,
    /\bneed\s+(help|assistance)\b/i,
    /\bcan\s+you\s+help\b/i,
    /\bstuck\b/i,
    /\bconfused\b/i
  ];

  // Patterns that indicate greetings or casual mentions
  private readonly GREETING_PATTERNS = [
    /^(hi|hello|hey)\s*(bot|assistant)?\s*[!.]?$/i,
    /^(good\s+(morning|afternoon|evening))\s*(bot|assistant)?\s*[!.]?$/i,
    /^(thanks?|thank\s+you)\s*(bot|assistant)?\s*[!.]?$/i,
    /^(bye|goodbye|see\s+you)\s*(bot|assistant)?\s*[!.]?$/i
  ];

  // Words that indicate uncertainty or vagueness
  private readonly VAGUE_INDICATORS = [
    'maybe', 'perhaps', 'possibly', 'might', 'could be', 'not sure',
    'unclear', 'confused', 'dunno', "don't know", 'uncertain',
    'kinda', 'sorta', 'somewhat', 'thing', 'stuff', 'something'
  ];

  constructor(geminiClient: GeminiApiClient) {
    this.geminiClient = geminiClient;
  }

  async analyzeSummonContext(
    summonResult: SummonResult,
    message: ChatMessage,
    context: ConversationContext
  ): Promise<SummonContext> {
    const extractedRequest = summonResult.extractedRequest || message.content;
    const cleanedRequest = this.cleanRequest(extractedRequest);

    // Determine question type
    const questionType = this.classifyQuestionType(cleanedRequest);
    
    // Check for explicit question markers
    const hasExplicitQuestion = this.hasExplicitQuestionMarkers(cleanedRequest);
    
    // Calculate question clarity score
    const questionClarity = await this.calculateQuestionClarity(cleanedRequest, context);
    
    // Determine if clarification is needed
    const requiresClarification = this.shouldRequestClarification(
      questionType, 
      questionClarity, 
      cleanedRequest
    );
    
    // Check if direct response is possible
    const directResponsePossible = this.canProvideDirectResponse(
      questionType, 
      questionClarity, 
      cleanedRequest
    );
    
    // Extract contextual cues
    const contextualCues = this.extractContextualCues(cleanedRequest, context);
    
    // Extract intent using AI if needed
    const extractedIntent = await this.extractQuestionIntent(cleanedRequest);

    return {
      hasExplicitQuestion,
      questionClarity,
      requiresClarification,
      directResponsePossible,
      questionType,
      contextualCues,
      extractedIntent
    };
  }

  determineResponseType(summonContext: SummonContext): ResponseType {
    // If it's just a greeting, acknowledge it
    if (summonContext.questionType === QuestionType.GREETING) {
      return ResponseType.ACKNOWLEDGMENT;
    }

    // If clarification is needed, request it
    if (summonContext.requiresClarification) {
      return ResponseType.CLARIFICATION_NEEDED;
    }

    // If it's an information request, handle it as such
    if (summonContext.questionType === QuestionType.INFORMATION_REQUEST) {
      return ResponseType.INFORMATION_REQUEST;
    }

    // If we can provide a direct response, do so
    if (summonContext.directResponsePossible) {
      return ResponseType.DIRECT_ANSWER;
    }

    // Default to clarification if uncertain
    return ResponseType.CLARIFICATION_NEEDED;
  }

  async extractQuestionIntent(text: string): Promise<string> {
    if (!text || text.trim().length < 3) {
      return 'unclear intent';
    }

    const prompt = `Analyze this user message and extract the core intent in 1-2 words:
    
    Message: "${text}"
    
    Examples:
    - "What's the market size?" → "market data"
    - "Help me understand this valuation" → "valuation help"
    - "Can you analyze this company?" → "company analysis"
    - "What do you think about this deal?" → "deal opinion"
    - "Hi bot" → "greeting"
    
    Respond with just the intent (1-2 words):`;

    try {
      const response = await this.geminiClient.analyzeText(text, prompt);
      return response.content?.trim().toLowerCase() || 'general help';
    } catch (error) {
      // Fallback to simple keyword extraction
      return this.extractIntentFromKeywords(text);
    }
  }

  private cleanRequest(request: string): string {
    return request
      .trim()
      .replace(/^(bot|assistant|ai)[,:\s]+/i, '') // Remove bot mentions at start
      .replace(/[,:\s]+(bot|assistant|ai)$/i, '') // Remove bot mentions at end
      .trim();
  }

  private classifyQuestionType(text: string): QuestionType {
    if (this.matchesPatterns(text, this.GREETING_PATTERNS)) {
      return QuestionType.GREETING;
    }

    // Check opinion requests before direct questions since they're more specific
    if (this.matchesPatterns(text, this.OPINION_REQUEST_PATTERNS)) {
      return QuestionType.OPINION_REQUEST;
    }

    if (this.matchesPatterns(text, this.INFORMATION_REQUEST_PATTERNS)) {
      return QuestionType.INFORMATION_REQUEST;
    }

    if (this.matchesPatterns(text, this.HELP_REQUEST_PATTERNS)) {
      return QuestionType.HELP_REQUEST;
    }

    if (this.matchesPatterns(text, this.DIRECT_QUESTION_PATTERNS)) {
      return QuestionType.DIRECT_QUESTION;
    }

    return QuestionType.UNCLEAR_REQUEST;
  }

  private hasExplicitQuestionMarkers(text: string): boolean {
    return text.includes('?') || 
           this.matchesPatterns(text, this.DIRECT_QUESTION_PATTERNS) ||
           this.matchesPatterns(text, this.OPINION_REQUEST_PATTERNS);
  }

  private async calculateQuestionClarity(text: string, context: ConversationContext): Promise<number> {
    let clarity = 0.5; // Base score

    // Increase clarity for specific patterns
    if (this.hasExplicitQuestionMarkers(text)) clarity += 0.2;
    if (text.length > 10) clarity += 0.1;
    if (this.containsSpecificTerms(text)) clarity += 0.2;
    
    // Decrease clarity for vague indicators
    const vaguenessCount = this.countVagueIndicators(text);
    clarity -= vaguenessCount * 0.2; // Increased penalty for vagueness
    
    // Decrease clarity for very short requests
    if (text.length < 5) clarity -= 0.3;
    
    // Increase clarity if it relates to current topic
    if (this.relatestoCurrentTopic(text, context.currentTopic)) {
      clarity += 0.1;
    }

    return Math.max(0, Math.min(1, clarity));
  }

  private shouldRequestClarification(
    questionType: QuestionType, 
    clarity: number, 
    text: string
  ): boolean {
    // Don't clarify greetings
    if (questionType === QuestionType.GREETING) return false;
    
    // Always clarify unclear requests
    if (questionType === QuestionType.UNCLEAR_REQUEST) return true;
    
    // Clarify if clarity is too low
    if (clarity < 0.4) return true;
    
    // Clarify very short non-greeting messages
    if (text.length < 5) return true;
    
    return false;
  }

  private canProvideDirectResponse(
    questionType: QuestionType, 
    clarity: number, 
    text: string
  ): boolean {
    // Can respond to greetings directly
    if (questionType === QuestionType.GREETING) return true;
    
    // Can respond if clarity is high enough
    if (clarity >= 0.6) return true;
    
    // Can respond to clear direct questions
    if (questionType === QuestionType.DIRECT_QUESTION && clarity >= 0.5) return true;
    
    // Can respond to clear opinion requests
    if (questionType === QuestionType.OPINION_REQUEST && clarity >= 0.5) return true;
    
    return false;
  }

  private extractContextualCues(text: string, context: ConversationContext): string[] {
    const cues: string[] = [];
    
    // Add current topic as context
    if (context.currentTopic) {
      cues.push(`current_topic:${context.currentTopic}`);
    }
    
    // Add meeting type as context
    if (context.meetingType) {
      cues.push(`meeting_type:${context.meetingType}`);
    }
    
    // Extract entities from the text
    const entities = this.extractEntities(text);
    cues.push(...entities.map(entity => `entity:${entity}`));
    
    return cues;
  }

  private matchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
  }

  private containsSpecificTerms(text: string): boolean {
    const specificTerms = [
      'valuation', 'market', 'company', 'investment', 'funding', 'revenue',
      'growth', 'analysis', 'data', 'metrics', 'financial', 'due diligence',
      'portfolio', 'startup', 'venture', 'equity', 'term sheet', 'cap table'
    ];
    
    const lowerText = text.toLowerCase();
    return specificTerms.some(term => lowerText.includes(term));
  }

  private countVagueIndicators(text: string): number {
    const lowerText = text.toLowerCase();
    return this.VAGUE_INDICATORS.filter(indicator => 
      lowerText.includes(indicator)
    ).length;
  }

  private relatestoCurrentTopic(text: string, currentTopic: string): boolean {
    if (!currentTopic) return false;
    
    const topicWords = currentTopic.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();
    
    return topicWords.some(word => 
      word.length > 3 && textLower.includes(word)
    );
  }

  private extractEntities(text: string): string[] {
    const entities: string[] = [];
    
    // Simple entity extraction - could be enhanced with NLP
    const companyPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|Corp|LLC|Ltd))?\b/g;
    const matches = text.match(companyPattern);
    
    if (matches) {
      entities.push(...matches.filter(match => match.length > 2));
    }
    
    return entities;
  }

  private extractIntentFromKeywords(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('market')) return 'market data';
    if (lowerText.includes('valuation')) return 'valuation help';
    if (lowerText.includes('company')) return 'company analysis';
    if (lowerText.includes('investment')) return 'investment analysis';
    if (lowerText.includes('help')) return 'general help';
    if (lowerText.includes('think')) return 'opinion request';
    
    return 'general inquiry';
  }
}