import { describe, it, expect, beforeEach } from 'vitest';
import { 
  KnowledgeBase, 
  Entity, 
  EntityType, 
  KnowledgeItem, 
  InformationGap 
} from '../../src/services/KnowledgeBase';
import { InformationType, ExpertiseArea } from '../../src/models/Enums';

describe('KnowledgeBase', () => {
  let knowledgeBase: KnowledgeBase;
  let sampleEntity: Entity;
  let sampleKnowledgeItem: KnowledgeItem;

  beforeEach(() => {
    knowledgeBase = new KnowledgeBase();
    
    sampleEntity = {
      id: 'company_stripe',
      name: 'Stripe',
      type: EntityType.COMPANY,
      aliases: ['stripe inc', 'stripe payments'],
      metadata: {
        industry: ExpertiseArea.FINTECH,
        foundingYear: 2010,
        marketCap: 95000000000,
        lastUpdated: new Date(),
        confidence: 0.9,
        sources: ['crunchbase', 'company_website']
      }
    };

    sampleKnowledgeItem = {
      id: 'stripe_financials',
      entityId: 'company_stripe',
      informationType: InformationType.FINANCIAL_METRICS,
      content: 'Stripe processes over $640 billion in payments annually',
      sources: ['stripe_annual_report'],
      lastUpdated: new Date(),
      relevanceScore: 0.8
    };
  });

  describe('Entity Storage and Retrieval', () => {
    it('should store and retrieve entities correctly', () => {
      knowledgeBase.storeEntity(sampleEntity);
      
      const foundEntity = knowledgeBase.findEntity('Stripe');
      expect(foundEntity).toEqual(sampleEntity);
    });

    it('should find entities by aliases', () => {
      knowledgeBase.storeEntity(sampleEntity);
      
      const foundByAlias = knowledgeBase.findEntity('stripe inc');
      expect(foundByAlias).toEqual(sampleEntity);
      
      const foundByAlias2 = knowledgeBase.findEntity('stripe payments');
      expect(foundByAlias2).toEqual(sampleEntity);
    });

    it('should be case insensitive when finding entities', () => {
      knowledgeBase.storeEntity(sampleEntity);
      
      const foundEntity = knowledgeBase.findEntity('STRIPE');
      expect(foundEntity).toEqual(sampleEntity);
    });

    it('should return undefined for non-existent entities', () => {
      const foundEntity = knowledgeBase.findEntity('NonExistentCompany');
      expect(foundEntity).toBeUndefined();
    });

    it('should get entities by type', () => {
      const company1 = { ...sampleEntity, id: 'company1' };
      const company2 = { ...sampleEntity, id: 'company2', name: 'PayPal' };
      const sector = {
        id: 'sector_fintech',
        name: 'FinTech',
        type: EntityType.MARKET_SECTOR,
        aliases: ['fintech'],
        metadata: {
          confidence: 0.8,
          lastUpdated: new Date(),
          sources: ['industry_report']
        }
      };

      knowledgeBase.storeEntity(company1);
      knowledgeBase.storeEntity(company2);
      knowledgeBase.storeEntity(sector);

      const companies = knowledgeBase.getEntitiesByType(EntityType.COMPANY);
      expect(companies).toHaveLength(2);
      expect(companies.map(c => c.id)).toContain('company1');
      expect(companies.map(c => c.id)).toContain('company2');

      const sectors = knowledgeBase.getEntitiesByType(EntityType.MARKET_SECTOR);
      expect(sectors).toHaveLength(1);
      expect(sectors[0].id).toBe('sector_fintech');
    });
  });

  describe('Knowledge Item Management', () => {
    beforeEach(() => {
      knowledgeBase.storeEntity(sampleEntity);
    });

    it('should store and retrieve knowledge items', () => {
      knowledgeBase.storeKnowledgeItem(sampleKnowledgeItem);
      
      const result = knowledgeBase.retrieveInformation(['company_stripe']);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(sampleKnowledgeItem);
    });

    it('should replace existing knowledge items of same type', () => {
      const item1 = { ...sampleKnowledgeItem, content: 'Old content' };
      const item2 = { ...sampleKnowledgeItem, content: 'New content' };

      knowledgeBase.storeKnowledgeItem(item1);
      knowledgeBase.storeKnowledgeItem(item2);

      const result = knowledgeBase.retrieveInformation(['company_stripe']);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe('New content');
    });

    it('should store multiple knowledge items of different types', () => {
      const financialItem = { ...sampleKnowledgeItem };
      const marketItem = {
        ...sampleKnowledgeItem,
        id: 'stripe_market',
        informationType: InformationType.MARKET_DATA,
        content: 'Stripe operates in the payments processing market'
      };

      knowledgeBase.storeKnowledgeItem(financialItem);
      knowledgeBase.storeKnowledgeItem(marketItem);

      const result = knowledgeBase.retrieveInformation(['company_stripe']);
      expect(result.items).toHaveLength(2);
    });

    it('should filter by information types when retrieving', () => {
      const financialItem = { ...sampleKnowledgeItem };
      const marketItem = {
        ...sampleKnowledgeItem,
        id: 'stripe_market',
        informationType: InformationType.MARKET_DATA,
        content: 'Market data content'
      };

      knowledgeBase.storeKnowledgeItem(financialItem);
      knowledgeBase.storeKnowledgeItem(marketItem);

      const result = knowledgeBase.retrieveInformation(
        ['company_stripe'], 
        [InformationType.FINANCIAL_METRICS]
      );
      
      expect(result.items).toHaveLength(1);
      expect(result.items[0].informationType).toBe(InformationType.FINANCIAL_METRICS);
    });

    it('should sort results by relevance score', () => {
      const lowRelevanceItem = {
        ...sampleKnowledgeItem,
        id: 'low_relevance',
        relevanceScore: 0.3
      };
      const highRelevanceItem = {
        ...sampleKnowledgeItem,
        id: 'high_relevance',
        informationType: InformationType.MARKET_DATA,
        relevanceScore: 0.9
      };

      knowledgeBase.storeKnowledgeItem(lowRelevanceItem);
      knowledgeBase.storeKnowledgeItem(highRelevanceItem);

      const result = knowledgeBase.retrieveInformation(['company_stripe']);
      expect(result.items[0].relevanceScore).toBe(0.9);
      expect(result.items[1].relevanceScore).toBe(0.3);
    });
  });

  describe('Entity Extraction', () => {
    beforeEach(() => {
      knowledgeBase.storeEntity(sampleEntity);
    });

    it('should extract known entities from text', () => {
      const text = 'We should consider investing in Stripe for our fintech portfolio';
      
      const result = knowledgeBase.extractEntities(text);
      
      expect(result.entities.length).toBeGreaterThan(0);
      const stripeEntity = result.entities.find(e => e.name === 'Stripe');
      expect(stripeEntity).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should extract entities by aliases', () => {
      const text = 'Stripe Inc has been performing well in payments';
      
      const result = knowledgeBase.extractEntities(text);
      
      const stripeEntity = result.entities.find(e => e.id === 'company_stripe');
      expect(stripeEntity).toBeDefined();
    });

    it('should extract financial terms', () => {
      const text = 'The company has $50M ARR and 3x revenue multiple';
      
      const result = knowledgeBase.extractEntities(text);
      
      const financialEntities = result.entities.filter(e => e.type === EntityType.FINANCIAL_TERM);
      expect(financialEntities.length).toBeGreaterThan(0);
      
      const hasArrTerm = financialEntities.some(e => e.name.toLowerCase().includes('arr'));
      const hasRevenueTerm = financialEntities.some(e => e.name.toLowerCase().includes('revenue'));
      expect(hasArrTerm || hasRevenueTerm).toBe(true);
    });

    it('should extract market sectors', () => {
      const text = 'This fintech startup is building a SaaS platform';
      
      const result = knowledgeBase.extractEntities(text);
      
      const sectorEntities = result.entities.filter(e => e.type === EntityType.MARKET_SECTOR);
      expect(sectorEntities.length).toBeGreaterThan(0);
      
      const hasFintechSector = sectorEntities.some(e => e.name === 'fintech');
      const hasSaasSector = sectorEntities.some(e => e.name === 'saas');
      expect(hasFintechSector || hasSaasSector).toBe(true);
    });

    it('should return low confidence when no entities found', () => {
      const text = 'This is just regular text with no entities';
      
      const result = knowledgeBase.extractEntities(text);
      
      expect(result.confidence).toBe(0.0);
      expect(result.entities).toHaveLength(0);
    });

    it('should not duplicate entities in results', () => {
      const text = 'Stripe and Stripe Inc are the same company, Stripe processes payments';
      
      const result = knowledgeBase.extractEntities(text);
      
      const stripeEntities = result.entities.filter(e => e.id === 'company_stripe');
      expect(stripeEntities).toHaveLength(1);
    });
  });

  describe('Information Gap Detection', () => {
    beforeEach(() => {
      knowledgeBase.storeEntity(sampleEntity);
    });

    it('should detect missing required information for companies', () => {
      // Only store financial metrics, missing company info and market data
      knowledgeBase.storeKnowledgeItem(sampleKnowledgeItem);
      
      const gaps = knowledgeBase.detectInformationGaps([sampleEntity], 'investment discussion');
      
      expect(gaps.length).toBeGreaterThan(0);
      const missingTypes = gaps.map(gap => gap.missingInformationType);
      expect(missingTypes).toContain(InformationType.COMPANY_INFO);
      expect(missingTypes).toContain(InformationType.MARKET_DATA);
    });

    it('should prioritize gaps based on context', () => {
      const gaps = knowledgeBase.detectInformationGaps([sampleEntity], 'investment evaluation meeting');
      
      expect(gaps.length).toBeGreaterThan(0);
      // Should be sorted by priority (highest first)
      for (let i = 1; i < gaps.length; i++) {
        expect(gaps[i-1].priority).toBeGreaterThanOrEqual(gaps[i].priority);
      }
    });

    it('should provide suggested sources for gaps', () => {
      const gaps = knowledgeBase.detectInformationGaps([sampleEntity], 'due diligence');
      
      expect(gaps.length).toBeGreaterThan(0);
      const gapWithSources = gaps.find(gap => gap.suggestedSources && gap.suggestedSources.length > 0);
      expect(gapWithSources).toBeDefined();
    });

    it('should not report gaps for information that exists', () => {
      // Store all required information types
      const companyInfo: KnowledgeItem = {
        id: 'stripe_info',
        entityId: 'company_stripe',
        informationType: InformationType.COMPANY_INFO,
        content: 'Stripe is a payment processing company',
        sources: ['company_website'],
        lastUpdated: new Date(),
        relevanceScore: 0.8
      };
      
      const marketData: KnowledgeItem = {
        id: 'stripe_market',
        entityId: 'company_stripe',
        informationType: InformationType.MARKET_DATA,
        content: 'Payment processing market size: $50B',
        sources: ['market_research'],
        lastUpdated: new Date(),
        relevanceScore: 0.7
      };

      knowledgeBase.storeKnowledgeItem(sampleKnowledgeItem); // Financial metrics
      knowledgeBase.storeKnowledgeItem(companyInfo);
      knowledgeBase.storeKnowledgeItem(marketData);
      
      const gaps = knowledgeBase.detectInformationGaps([sampleEntity], 'investment discussion');
      
      // Should have no gaps for the required information types
      const requiredTypes = [
        InformationType.COMPANY_INFO,
        InformationType.FINANCIAL_METRICS,
        InformationType.MARKET_DATA
      ];
      
      for (const requiredType of requiredTypes) {
        const hasGap = gaps.some(gap => gap.missingInformationType === requiredType);
        expect(hasGap).toBe(false);
      }
    });

    it('should handle multiple entities', () => {
      const secondEntity: Entity = {
        id: 'company_paypal',
        name: 'PayPal',
        type: EntityType.COMPANY,
        aliases: ['paypal inc'],
        metadata: {
          industry: ExpertiseArea.FINTECH,
          confidence: 0.8,
          lastUpdated: new Date(),
          sources: ['crunchbase']
        }
      };

      knowledgeBase.storeEntity(secondEntity);
      
      const gaps = knowledgeBase.detectInformationGaps(
        [sampleEntity, secondEntity], 
        'competitive analysis'
      );
      
      // Should have gaps for both entities
      const stripeGaps = gaps.filter(gap => gap.entityId === 'company_stripe');
      const paypalGaps = gaps.filter(gap => gap.entityId === 'company_paypal');
      
      expect(stripeGaps.length).toBeGreaterThan(0);
      expect(paypalGaps.length).toBeGreaterThan(0);
    });
  });

  describe('Information Retrieval Performance', () => {
    it('should track retrieval time', () => {
      knowledgeBase.storeEntity(sampleEntity);
      knowledgeBase.storeKnowledgeItem(sampleKnowledgeItem);
      
      const result = knowledgeBase.retrieveInformation(['company_stripe']);
      
      expect(result.retrievalTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.retrievalTime).toBe('number');
    });

    it('should handle empty entity lists', () => {
      const result = knowledgeBase.retrieveInformation([]);
      
      expect(result.items).toHaveLength(0);
      expect(result.gaps).toHaveLength(0);
      expect(result.retrievalTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-existent entities gracefully', () => {
      const result = knowledgeBase.retrieveInformation(['non_existent_entity']);
      
      expect(result.items).toHaveLength(0);
      expect(result.retrievalTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration with Information Types', () => {
    it('should identify gaps when requesting specific information types', () => {
      knowledgeBase.storeEntity(sampleEntity);
      
      const result = knowledgeBase.retrieveInformation(
        ['company_stripe'],
        [InformationType.FINANCIAL_METRICS, InformationType.MARKET_DATA]
      );
      
      expect(result.gaps).toHaveLength(2);
      expect(result.gaps.map(g => g.missingInformationType)).toContain(InformationType.FINANCIAL_METRICS);
      expect(result.gaps.map(g => g.missingInformationType)).toContain(InformationType.MARKET_DATA);
    });

    it('should not create gaps when information exists for requested types', () => {
      knowledgeBase.storeEntity(sampleEntity);
      knowledgeBase.storeKnowledgeItem(sampleKnowledgeItem);
      
      const result = knowledgeBase.retrieveInformation(
        ['company_stripe'],
        [InformationType.FINANCIAL_METRICS]
      );
      
      expect(result.items).toHaveLength(1);
      expect(result.gaps).toHaveLength(0);
    });
  });
});