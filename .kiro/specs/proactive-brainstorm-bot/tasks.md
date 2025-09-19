# Implementation Plan

## Important Testing Note
**ALWAYS use the `--run` flag when running tests** (e.g., `npm test -- tests/file.test.ts --run`) to avoid hanging test processes that require manual cancellation. This ensures tests complete quickly and don't block the development workflow.

- [x] 1. Set up project structure and core interfaces
  - Create TypeScript project with proper directory structure (src/models, src/services, src/api, tests/)
  - Define core TypeScript interfaces for ChatMessage, ProcessedMessage, ConversationContext, and InterventionDecision
  - Set up environment configuration for Gemini API key and basic logging
  - _Requirements: All requirements depend on this foundation_

- [x] 2. Implement Gemini API client and basic message processing
  - Create GeminiApiClient class with authentication and basic text analysis capabilities
  - Implement MessageProcessor class to handle incoming chat messages and extract basic metadata
  - Write unit tests for API client connection and message processing functionality
  - _Requirements: 1.1, 2.1, 3.1, 4.1_

- [x] 3. Build conversation context tracking system
  - Implement ConversationContext class to maintain chat history and participant information
  - Create methods to track conversation flow, topic changes, and participant engagement
  - Write tests for context maintenance and history management
  - _Requirements: 1.1, 1.2, 4.1, 4.2_

- [x] 4. Develop topic analysis and drift detection
  - Implement ContextAnalyzer class with topic classification using Gemini API
  - Create topic drift detection algorithm that identifies when conversations go off-track
  - Build methods to analyze conversation stability and momentum
  - Write comprehensive tests for topic analysis accuracy
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 4.1 Enhance topic drift detection with proactive focus protection
  - Update drift detection to trigger after 2 consecutive off-topic messages (reduced from 3)
  - Implement investment relevance scoring with 0.6 threshold for intervention
  - Create diplomatic redirection strategy generator with context preservation
  - Write tests for enhanced drift detection sensitivity and redirection quality
  - _Requirements: 1.1, 1.4, 1.5_

- [x] 5. Create intervention decision engine core logic
  - Implement InterventionDecisionEngine class with rule-based decision making
  - Create scoring algorithms for intervention necessity, timing, and confidence
  - Build intervention type classification (topic redirect, information provide, fact check)
  - Write unit tests for decision logic with various conversation scenarios
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.2_

- [x] 6. Implement proactive information retrieval system
  - Create KnowledgeBase class to store and retrieve VC-relevant information
  - Implement entity extraction to identify companies, market sectors, and financial terms
  - Build information gap detection to identify when additional data would be helpful
  - Write tests for entity recognition and information matching
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

- [x] 7. Build response generation system
  - Implement ResponseGenerator class using Gemini API for contextual response creation
  - Create response templates for different intervention types (redirects, information, fact-checks)
  - Build response personalization based on user roles and conversation tone
  - Write tests for response appropriateness and tone consistency
  - _Requirements: 1.1, 2.1, 3.1, 5.1, 5.2_

- [x] 7.1 Implement professional communication standards and robotic phrase removal
  - Create CommunicationFilter class to detect and remove robotic phrases like "Based on your question about..."
  - Implement executive-level language validation and enhancement algorithms
  - Build natural flow enhancement that eliminates echoing user words verbatim
  - Write comprehensive tests for professional tone validation and robotic phrase detection
  - _Requirements: 6.1, 6.2, 6.3, 5.2_

- [x] 8. Develop timing and conversation flow analysis
  - Implement conversation pause detection to identify natural intervention points
  - Create algorithms to assess conversation momentum and participant engagement
  - Build timing strategy logic to determine optimal intervention moments
  - Write tests for timing accuracy and flow disruption minimization
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 9. Create user feedback and learning system
  - Implement LearningModule class to track intervention outcomes and user reactions
  - Build feedback collection mechanisms for explicit and implicit user responses
  - Create behavior adjustment algorithms based on historical performance
  - Write tests for learning accuracy and behavior adaptation
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Implement summoning and manual control features
  - Create bot mention detection and trigger phrase recognition
  - Implement immediate response system for direct user requests
  - Build manual control features for adjusting bot activity levels
  - Write tests for summoning accuracy and manual override functionality
  - _Requirements: 5.1, 5.2, 5.3, 4.3_

- [x] 10.1 Improve summoning response intelligence and eliminate generic responses
  - Implement SummonContext analysis to determine if questions are clear vs. need clarification
  - Create direct response logic that answers clear questions immediately without asking "what do you need"
  - Build context-aware response type determination (direct answer vs. clarification request)
  - Write tests for summon response intelligence and question clarity detection
  - _Requirements: 5.2, 5.4, 6.2_

- [x] 11. Build real-time chat integration layer
  - Create ChatInterface class to handle real-time message streaming
  - Implement message queue system for processing chat updates
  - Build WebSocket or similar real-time communication handling
  - Write integration tests for real-time message processing
  - _Requirements: All requirements require real-time processing_

- [x] 12. Develop comprehensive error handling and resilience
  - Implement API failure handling with exponential backoff and retry logic
  - Create fallback systems for when Gemini API is unavailable
  - Build graceful degradation for ambiguous or conflicting information
  - Write tests for error scenarios and recovery mechanisms
  - _Requirements: 2.4, 3.3, plus system reliability for all requirements_

- [x] 13. Create configuration and user preference system
  - Implement UserPreferences class for storing individual user settings
  - Build configuration system for intervention frequency and communication style
  - Create preference learning from user behavior patterns
  - Write tests for preference storage and application
  - _Requirements: 4.3, 6.1, 6.2, 6.4_

- [x] 14. Build comprehensive testing and validation framework
  - Create conversation simulation system for testing proactive behavior
  - Implement performance benchmarks for real-time response requirements
  - Build A/B testing framework for intervention strategies
  - Write end-to-end tests simulating complete VC conversation scenarios
  - _Requirements: All requirements need validation through comprehensive testing_

- [x] 15.1 Integrate professional communication and enhanced focus protection
  - Update main ProactiveBrainstormBot class to use enhanced communication filters
  - Integrate improved topic drift detection with 2-message threshold
  - Implement end-to-end professional response validation pipeline
  - Write integration tests that validate both professional communication and proactive focus protection
  - _Requirements: 1.4, 1.5, 6.1, 6.2, 6.3, 6.5_

- [x] 15. Integrate all components and create main application
  - Create main ProactiveBrainstormBot class that orchestrates all components
  - Implement startup sequence and configuration loading
  - Build monitoring and logging system for production deployment
  - Write integration tests for complete system functionality
  - _Requirements: All requirements come together in the final integrated system_