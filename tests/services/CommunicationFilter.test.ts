import { describe, it, expect, beforeEach } from 'vitest';
import { CommunicationFilter, RoboticPhrase, ValidationResult, CommunicationQuality } from '../../src/services/CommunicationFilter';
import { CommunicationStyle, MeetingType } from '../../src/models/Enums';
import { Participant } from '../../src/models/UserPreferences';

describe('CommunicationFilter', () => {
  let filter: CommunicationFilter;

  beforeEach(() => {
    filter = new CommunicationFilter();
  });

  describe('detectRoboticPhrases', () => {
    it('should detect common robotic opening phrases', () => {
      const testCases = [
        'Based on your question about market trends, here is the analysis.',
        'According to your request for information, I can provide the following.',
        'As per your inquiry regarding the company valuation, the data shows...',
        'In response to your question about funding rounds, the metrics indicate...'
      ];

      testCases.forEach(text => {
        const detected = filter.detectRoboticPhrases(text);
        expect(detected.length).toBeGreaterThan(0);
        expect(detected[0].severity).toBe('high');
      });
    });

    it('should detect generic response patterns', () => {
      const text = 'What do you need?';
      const detected = filter.detectRoboticPhrases(text);
      
      expect(detected.length).toBe(1);
      expect(detected[0].severity).toBe('medium');
    });

    it('should detect robotic acknowledgments', () => {
      const text = 'I understand that you are looking for market data.';
      const detected = filter.detectRoboticPhrases(text);
      
      expect(detected.length).toBe(1);
      expect(detected[0].severity).toBe('medium');
    });

    it('should not detect natural business language', () => {
      const naturalTexts = [
        'The market analysis shows strong growth potential.',
        'Current valuation metrics indicate favorable conditions.',
        'Portfolio performance has exceeded expectations this quarter.'
      ];

      naturalTexts.forEach(text => {
        const detected = filter.detectRoboticPhrases(text);
        expect(detected.length).toBe(0);
      });
    });

    it('should handle empty or short text', () => {
      expect(filter.detectRoboticPhrases('')).toEqual([]);
      expect(filter.detectRoboticPhrases('Yes.')).toEqual([]);
    });
  });

  describe('removeEchoingPatterns', () => {
    it('should remove exact echoing of user input', () => {
      const userInput = 'What is the market size for fintech companies?';
      const botResponse = 'Regarding the market size for fintech companies, the current data shows $150B globally.';
      
      const cleaned = filter.removeEchoingPatterns(botResponse, userInput);
      
      expect(cleaned).not.toContain('market size for fintech companies');
      expect(cleaned).toContain('$150B globally');
    });

    it('should remove sentences that start with user phrases', () => {
      const userInput = 'Tell me about Series A funding rounds';
      const botResponse = 'Series A funding rounds typically range from $2-15M. The average deal size has increased 20% this year.';
      
      const cleaned = filter.removeEchoingPatterns(botResponse, userInput);
      
      expect(cleaned).toContain('The average deal size has increased 20% this year');
      expect(cleaned).not.toContain('Series A funding rounds typically');
    });

    it('should handle multiple echoing patterns', () => {
      const userInput = 'What are the key metrics for SaaS companies?';
      const botResponse = 'The key metrics for SaaS companies include ARR, churn rate, and CAC. Key metrics for SaaS companies are essential for valuation.';
      
      const cleaned = filter.removeEchoingPatterns(botResponse, userInput);
      
      expect(cleaned).not.toContain('key metrics for SaaS companies');
      expect(cleaned).toContain('ARR, churn rate, and CAC');
    });

    it('should preserve content when no echoing detected', () => {
      const userInput = 'What is the current market trend?';
      const botResponse = 'Enterprise software valuations have increased 15% this quarter due to strong demand.';
      
      const cleaned = filter.removeEchoingPatterns(botResponse, userInput);
      
      expect(cleaned).toBe(botResponse);
    });

    it('should handle short user input gracefully', () => {
      const userInput = 'Yes';
      const botResponse = 'The analysis shows positive market indicators.';
      
      const cleaned = filter.removeEchoingPatterns(botResponse, userInput);
      
      expect(cleaned).toBe(botResponse);
    });
  });

  describe('enhanceNaturalFlow', () => {
    it('should remove robotic phrases and improve flow', () => {
      const roboticText = 'Based on your question about market trends, I can provide the following analysis. The market shows growth.';
      
      const enhanced = filter.enhanceNaturalFlow(roboticText);
      
      expect(enhanced).not.toContain('Based on your question about');
      expect(enhanced).not.toContain('I can provide the following');
      expect(enhanced).toContain('market shows growth');
    });

    it('should add natural transitions between sentences', () => {
      const choppyText = 'The market is growing. Revenue increased 20%. Investors are interested.';
      
      const enhanced = filter.enhanceNaturalFlow(choppyText);
      
      // Should have better flow (exact transitions are randomized, so we check structure)
      expect(enhanced.split('. ').length).toBeGreaterThanOrEqual(2);
      expect(enhanced).toContain('market is growing');
      expect(enhanced.toLowerCase()).toContain('revenue increased 20%');
    });

    it('should clean up spacing and punctuation', () => {
      const messyText = 'The  analysis   shows  .  Strong growth   potential .';
      
      const enhanced = filter.enhanceNaturalFlow(messyText);
      
      expect(enhanced).not.toContain('  ');
      expect(enhanced).not.toContain(' .');
      expect(enhanced).toMatch(/^[A-Z]/); // Should start with capital
    });
  });

  describe('validateBusinessLanguage', () => {
    it('should identify unprofessional language', () => {
      const unprofessionalText = 'Yeah, this is awesome! The company is gonna do great!!!';
      
      const validation = filter.validateBusinessLanguage(unprofessionalText);
      
      expect(validation.isValid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.professionalScore).toBeLessThan(0.8);
      expect(validation.suggestions.length).toBeGreaterThan(0);
    });

    it('should detect robotic phrases as issues', () => {
      const roboticText = 'Based on your question about market analysis, I can provide the following information.';
      
      const validation = filter.validateBusinessLanguage(roboticText);
      
      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => issue.includes('Robotic phrases'))).toBe(true);
    });

    it('should flag overly long sentences', () => {
      const longSentenceText = 'This is an extremely long sentence that goes on and on without any clear structure or breaks and continues to ramble about various topics without providing clear value to the executive audience who needs concise and actionable information for decision making purposes.';
      
      const validation = filter.validateBusinessLanguage(longSentenceText);
      
      expect(validation.issues.some(issue => issue.includes('too long'))).toBe(true);
    });

    it('should flag overly short choppy sentences', () => {
      const choppyText = 'Good. Yes. Okay. Fine. Done.';
      
      const validation = filter.validateBusinessLanguage(choppyText);
      
      expect(validation.issues.some(issue => issue.includes('too short'))).toBe(true);
    });

    it('should detect lack of confidence', () => {
      const uncertainText = 'I think maybe this company might be good, perhaps.';
      
      const validation = filter.validateBusinessLanguage(uncertainText);
      
      expect(validation.issues.some(issue => issue.includes('lacks confidence'))).toBe(true);
    });

    it('should validate professional business language', () => {
      const professionalText = 'The market analysis indicates strong growth potential with favorable risk-adjusted returns.';
      
      const validation = filter.validateBusinessLanguage(professionalText);
      
      expect(validation.isValid).toBe(true);
      expect(validation.professionalScore).toBeGreaterThan(0.8);
      expect(validation.issues.length).toBe(0);
    });
  });

  describe('ensureProfessionalTone', () => {
    it('should replace casual words with professional alternatives', () => {
      const casualText = 'Yeah, this is awesome! The company is gonna do great.';
      
      const professional = filter.ensureProfessionalTone(casualText);
      
      expect(professional).not.toContain('yeah');
      expect(professional).not.toContain('awesome');
      expect(professional).not.toContain('gonna');
      expect(professional).toContain('yes');
      expect(professional).toContain('excellent');
      expect(professional).toContain('going to');
    });

    it('should replace uncertain language with confident alternatives', () => {
      const uncertainText = 'I think this might be a good investment, maybe.';
      
      const professional = filter.ensureProfessionalTone(uncertainText);
      
      expect(professional).not.toContain('I think');
      expect(professional).not.toContain('might be');
      expect(professional).not.toContain('maybe');
      expect(professional).toContain('analysis indicates');
      expect(professional).toContain('appears to be');
      expect(professional).toContain('potentially');
    });

    it('should preserve already professional language', () => {
      const professionalText = 'The analysis indicates favorable market conditions with strong growth potential.';
      
      const result = filter.ensureProfessionalTone(professionalText);
      
      expect(result).toBe(professionalText);
    });
  });

  describe('removeRoboticPhrases', () => {
    it('should remove robotic opening phrases', () => {
      const roboticText = 'Based on your question about market trends, the analysis shows strong growth.';
      
      const cleaned = filter.removeRoboticPhrases(roboticText);
      
      expect(cleaned).not.toContain('Based on your question about');
      expect(cleaned).toContain('analysis shows strong growth');
      expect(cleaned).toMatch(/^[A-Z]/); // Should start with capital letter
    });

    it('should remove multiple robotic phrases', () => {
      const multiRoboticText = 'Thank you for your question about funding. Based on your inquiry, I hope this helps.';
      
      const cleaned = filter.removeRoboticPhrases(multiRoboticText);
      
      expect(cleaned).not.toContain('Thank you for your question');
      expect(cleaned).not.toContain('Based on your inquiry');
      expect(cleaned).not.toContain('I hope this helps');
    });

    it('should handle text with only robotic phrases', () => {
      const onlyRoboticText = 'Based on your question, what do you need?';
      
      const cleaned = filter.removeRoboticPhrases(onlyRoboticText);
      
      expect(cleaned.trim().length).toBe(0);
    });

    it('should preserve non-robotic content', () => {
      const mixedText = 'Based on your question, the market shows 15% growth this quarter.';
      
      const cleaned = filter.removeRoboticPhrases(mixedText);
      
      expect(cleaned).toContain('market shows 15% growth this quarter');
      expect(cleaned).toMatch(/^[A-Z]/);
    });
  });

  describe('adaptToMeetingContext', () => {
    it('should adapt language for investment review meetings', () => {
      const genericText = 'The company shows strong market position.';
      
      const adapted = filter.adaptToMeetingContext(genericText, MeetingType.INVESTMENT_REVIEW);
      
      expect(adapted).toContain('portfolio company');
      expect(adapted).toContain('investment market');
    });

    it('should add analytical tone for due diligence', () => {
      const genericText = 'The data shows good results in the market.';
      
      const adapted = filter.adaptToMeetingContext(genericText, MeetingType.DUE_DILIGENCE);
      
      expect(adapted).toContain('indicates');
      expect(adapted).toContain('favorable');
    });

    it('should add strategic framing for strategy sessions', () => {
      const genericText = 'We need to solve this problem with a good solution.';
      
      const adapted = filter.adaptToMeetingContext(genericText, MeetingType.STRATEGY_SESSION);
      
      expect(adapted).toContain('strategic challenge');
      expect(adapted).toContain('strategic approach');
    });

    it('should add performance focus for portfolio updates', () => {
      const genericText = 'The results show strong growth.';
      
      const adapted = filter.adaptToMeetingContext(genericText, MeetingType.PORTFOLIO_UPDATE);
      
      expect(adapted).toContain('performance metrics');
      expect(adapted).toContain('performance growth');
    });
  });

  describe('adjustForParticipantRoles', () => {
    it('should use diplomatic tone for mixed partner-entrepreneur meetings', () => {
      const participants: Participant[] = [
        { id: '1', name: 'Partner', role: 'partner', preferences: {} as any, engagementLevel: 0.8 },
        { id: '2', name: 'Entrepreneur', role: 'entrepreneur', preferences: {} as any, engagementLevel: 0.9 }
      ];
      
      const text = 'This approach failed and was wrong.';
      const adjusted = filter.adjustForParticipantRoles(text, participants);
      
      expect(adjusted).toContain('did not achieve expected results');
      expect(adjusted).toContain('suboptimal');
    });

    it('should use executive tone for partner-only meetings', () => {
      const participants: Participant[] = [
        { id: '1', name: 'Partner1', role: 'partner', preferences: {} as any, engagementLevel: 0.8 },
        { id: '2', name: 'Partner2', role: 'partner', preferences: {} as any, engagementLevel: 0.7 }
      ];
      
      const text = 'We should do this and we need that.';
      const adjusted = filter.adjustForParticipantRoles(text, participants);
      
      expect(adjusted).toContain('strategic approach would be');
      expect(adjusted).toContain('advisable to');
    });

    it('should use supportive tone for entrepreneur-focused meetings', () => {
      const participants: Participant[] = [
        { id: '1', name: 'Entrepreneur1', role: 'entrepreneur', preferences: {} as any, engagementLevel: 0.9 },
        { id: '2', name: 'Entrepreneur2', role: 'entrepreneur', preferences: {} as any, engagementLevel: 0.8 }
      ];
      
      const text = 'This was a mistake and created problems.';
      const adjusted = filter.adjustForParticipantRoles(text, participants);
      
      expect(adjusted).toContain('learning opportunity');
      expect(adjusted).toContain('opportunities for improvement');
    });
  });

  describe('maintainConversationalFlow', () => {
    it('should add formal structure for formal communication style', () => {
      const text = 'The market analysis shows positive trends.';
      
      const flowing = filter.maintainConversationalFlow(text, CommunicationStyle.FORMAL);
      
      expect(flowing).toContain('In summary');
    });

    it('should add conversational elements for conversational style', () => {
      const text = 'The market analysis shows positive trends.';
      
      const flowing = filter.maintainConversationalFlow(text, CommunicationStyle.CONVERSATIONAL);
      
      expect(flowing).toContain('Looking at this situation');
      expect(flowing).toContain('What are your thoughts');
    });

    it('should make text concise for brief style', () => {
      const text = 'In order to analyze the market, we need to look at multiple factors. The data shows growth.';
      
      const flowing = filter.maintainConversationalFlow(text, CommunicationStyle.BRIEF);
      
      expect(flowing).not.toContain('In order to');
      expect(flowing.split('.').length).toBeLessThanOrEqual(2); // Should be shortened
    });

    it('should add supporting detail for detailed style', () => {
      const text = 'The market shows growth.';
      
      const flowing = filter.maintainConversationalFlow(text, CommunicationStyle.DETAILED);
      
      expect(flowing).toContain('market conditions');
      expect(flowing).toContain('industry best practices');
    });
  });

  describe('evaluateCommunicationQuality', () => {
    it('should score professional text highly', () => {
      const professionalText = 'The market analysis indicates strong growth potential with favorable risk-adjusted returns for our portfolio companies.';
      
      const quality = filter.evaluateCommunicationQuality(professionalText);
      
      expect(quality.overallScore).toBeGreaterThan(0.8);
      expect(quality.professionalism).toBeGreaterThan(0.8);
      expect(quality.naturalness).toBeGreaterThan(0.8);
      expect(quality.clarity).toBeGreaterThan(0.8);
    });

    it('should score robotic text poorly', () => {
      const roboticText = 'Based on your question about market trends, I understand that you need information. What do you need?';
      
      const quality = filter.evaluateCommunicationQuality(roboticText);
      
      expect(quality.overallScore).toBeLessThan(0.75);
      expect(quality.naturalness).toBeLessThan(0.6);
    });

    it('should score unprofessional text poorly', () => {
      const unprofessionalText = 'Yeah, this is awesome! The company is gonna do great!!!';
      
      const quality = filter.evaluateCommunicationQuality(unprofessionalText);
      
      expect(quality.overallScore).toBeLessThan(0.8);
      expect(quality.professionalism).toBeLessThan(0.6);
    });

    it('should provide detailed quality metrics', () => {
      const text = 'The analysis shows market growth.';
      
      const quality = filter.evaluateCommunicationQuality(text);
      
      expect(quality).toHaveProperty('naturalness');
      expect(quality).toHaveProperty('professionalism');
      expect(quality).toHaveProperty('clarity');
      expect(quality).toHaveProperty('engagement');
      expect(quality).toHaveProperty('overallScore');
      
      expect(quality.naturalness).toBeGreaterThanOrEqual(0);
      expect(quality.naturalness).toBeLessThanOrEqual(1);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty strings gracefully', () => {
      expect(() => filter.detectRoboticPhrases('')).not.toThrow();
      expect(() => filter.removeEchoingPatterns('', '')).not.toThrow();
      expect(() => filter.enhanceNaturalFlow('')).not.toThrow();
      expect(() => filter.ensureProfessionalTone('')).not.toThrow();
      expect(() => filter.removeRoboticPhrases('')).not.toThrow();
    });

    it('should handle null or undefined input gracefully', () => {
      expect(() => filter.removeEchoingPatterns('test', '')).not.toThrow();
      expect(() => filter.removeEchoingPatterns('test', undefined as any)).not.toThrow();
    });

    it('should handle very long text without performance issues', () => {
      const longText = 'The market analysis shows growth. '.repeat(1000);
      
      const start = Date.now();
      const result = filter.validateBusinessLanguage(longText);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result).toBeDefined();
    });

    it('should handle special characters and unicode', () => {
      const specialText = 'The market shows 15% growth 📈 with $1.2M revenue.';
      
      expect(() => filter.validateBusinessLanguage(specialText)).not.toThrow();
      expect(() => filter.ensureProfessionalTone(specialText)).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should process a complete robotic response into professional output', () => {
      const roboticInput = 'Based on your question about market trends, I understand that you are looking for information. Yeah, this is awesome data! The company is gonna do great. What do you need?';
      
      // Apply full processing pipeline
      let processed = filter.removeRoboticPhrases(roboticInput);
      processed = filter.ensureProfessionalTone(processed);
      processed = filter.enhanceNaturalFlow(processed);
      
      const validation = filter.validateBusinessLanguage(processed);
      const quality = filter.evaluateCommunicationQuality(processed);
      
      expect(validation.professionalScore).toBeGreaterThan(0.7);
      expect(quality.overallScore).toBeGreaterThan(0.7);
      expect(processed).not.toContain('Based on your question');
      expect(processed).not.toContain('yeah');
      expect(processed).not.toContain('gonna');
      expect(processed).not.toContain('What do you need');
    });

    it('should maintain professional quality through context adaptation', () => {
      const baseText = 'The company shows strong performance with good market position.';
      
      const adapted = filter.adaptToMeetingContext(baseText, MeetingType.INVESTMENT_REVIEW);
      const roleAdjusted = filter.adjustForParticipantRoles(adapted, [
        { id: '1', name: 'Partner', role: 'partner', preferences: {} as any, engagementLevel: 0.8 }
      ]);
      const flowing = filter.maintainConversationalFlow(roleAdjusted, CommunicationStyle.FORMAL);
      
      const finalQuality = filter.evaluateCommunicationQuality(flowing);
      
      expect(finalQuality.overallScore).toBeGreaterThan(0.8);
      expect(finalQuality.professionalism).toBeGreaterThan(0.8);
    });
  });
});