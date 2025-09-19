import { InformationType, ExpertiseArea } from '../models/Enums';

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];
  metadata: EntityMetadata;
}

export enum EntityType {
  COMPANY = 'company',
  MARKET_SECTOR = 'market_sector',
  FINANCIAL_TERM = 'financial_term',
  PERSON = 'person',
  TECHNOLOGY = 'technology',
  GEOGRAPHIC_REGION = 'geographic_region'
}

export interface EntityMetadata {
  industry?: ExpertiseArea;
  foundingYear?: number;
  marketCap?: number;
  lastUpdated: Date;
  confidence: number; // 0-1 score
  sources: string[];
}

export interface KnowledgeItem {
  id: string;
  entityId: string;
  informationType: InformationType;
  content: string;
  sources: string[];
  lastUpdated: Date;
  relevanceScore: number; // 0-1 score
  expirationDate?: Date;
}

export interface InformationGap {
  entityId: string;
  missingInformationType: InformationType;
  priority: number; // 0-1 score
  context: string;
  suggestedSources?: string[];
}

export interface EntityExtractionResult {
  entities: Entity[];
  confidence: number;
  extractionMethod: string;
}

export interface InformationRetrievalResult {
  items: KnowledgeItem[];
  gaps: InformationGap[];
  retrievalTime: number;
}

/**
 * KnowledgeBase class manages VC-relevant information storage and retrieval
 */
export class KnowledgeBase {
  private entities: Map<string, Entity> = new Map();
  private knowledgeItems: Map<string, KnowledgeItem[]> = new Map();
  private entityAliases: Map<string, string> = new Map(); // alias -> entityId

  /**
   * Store an entity in the knowledge base
   */
  storeEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
    
    // Index aliases for quick lookup
    entity.aliases.forEach(alias => {
      this.entityAliases.set(alias.toLowerCase(), entity.id);
    });
    this.entityAliases.set(entity.name.toLowerCase(), entity.id);
  }

  /**
   * Store knowledge item associated with an entity
   */
  storeKnowledgeItem(item: KnowledgeItem): void {
    if (!this.knowledgeItems.has(item.entityId)) {
      this.knowledgeItems.set(item.entityId, []);
    }
    
    const items = this.knowledgeItems.get(item.entityId)!;
    
    // Remove existing item of same type if present
    const existingIndex = items.findIndex(
      existing => existing.informationType === item.informationType
    );
    
    if (existingIndex >= 0) {
      items[existingIndex] = item;
    } else {
      items.push(item);
    }
  }

  /**
   * Extract entities from text using pattern matching and known entity lists
   */
  extractEntities(text: string): EntityExtractionResult {
    const foundEntities: Entity[] = [];
    const textLower = text.toLowerCase();
    
    // Check for known entities by name and aliases
    for (const [alias, entityId] of this.entityAliases.entries()) {
      if (textLower.includes(alias)) {
        const entity = this.entities.get(entityId);
        if (entity && !foundEntities.find(e => e.id === entity.id)) {
          foundEntities.push(entity);
        }
      }
    }

    // Extract financial terms using patterns
    const financialTerms = this.extractFinancialTerms(text);
    foundEntities.push(...financialTerms);

    // Extract market sectors using patterns
    const marketSectors = this.extractMarketSectors(text);
    foundEntities.push(...marketSectors);

    return {
      entities: foundEntities,
      confidence: foundEntities.length > 0 ? 0.8 : 0.0,
      extractionMethod: 'pattern_matching'
    };
  }

  /**
   * Retrieve relevant information for given entities
   */
  retrieveInformation(entityIds: string[], informationTypes?: InformationType[]): InformationRetrievalResult {
    const startTime = Date.now();
    const items: KnowledgeItem[] = [];
    const gaps: InformationGap[] = [];

    for (const entityId of entityIds) {
      const entityItems = this.knowledgeItems.get(entityId) || [];
      
      if (informationTypes) {
        for (const infoType of informationTypes) {
          const item = entityItems.find(item => item.informationType === infoType);
          if (item) {
            items.push(item);
          } else {
            gaps.push({
              entityId,
              missingInformationType: infoType,
              priority: 0.7,
              context: `Missing ${infoType} for entity ${entityId}`
            });
          }
        }
      } else {
        items.push(...entityItems);
      }
    }

    return {
      items: items.sort((a, b) => b.relevanceScore - a.relevanceScore),
      gaps,
      retrievalTime: Date.now() - startTime
    };
  }

  /**
   * Detect information gaps based on conversation context
   */
  detectInformationGaps(entities: Entity[], conversationContext: string): InformationGap[] {
    const gaps: InformationGap[] = [];

    for (const entity of entities) {
      const entityItems = this.knowledgeItems.get(entity.id) || [];
      const availableTypes = new Set(entityItems.map(item => item.informationType));

      // Check for missing critical information types based on entity type
      const requiredTypes = this.getRequiredInformationTypes(entity.type);
      
      for (const requiredType of requiredTypes) {
        if (!availableTypes.has(requiredType)) {
          gaps.push({
            entityId: entity.id,
            missingInformationType: requiredType,
            priority: this.calculateGapPriority(entity, requiredType, conversationContext),
            context: conversationContext,
            suggestedSources: this.getSuggestedSources(entity.type, requiredType)
          });
        }
      }
    }

    return gaps.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Find entity by name or alias
   */
  findEntity(name: string): Entity | undefined {
    const entityId = this.entityAliases.get(name.toLowerCase());
    return entityId ? this.entities.get(entityId) : undefined;
  }

  /**
   * Get all entities of a specific type
   */
  getEntitiesByType(type: EntityType): Entity[] {
    return Array.from(this.entities.values()).filter(entity => entity.type === type);
  }

  private extractFinancialTerms(text: string): Entity[] {
    const financialPatterns = [
      /\b(valuation|revenue|ebitda|arr|mrr|ltv|cac|burn rate|runway)\b/gi,
      /\$[\d,]+[kmb]?/gi,
      /\b\d+x\s*(revenue|multiple)\b/gi
    ];

    const terms: Entity[] = [];
    
    for (const pattern of financialPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          terms.push({
            id: `financial_${match.toLowerCase().replace(/\s+/g, '_')}`,
            name: match,
            type: EntityType.FINANCIAL_TERM,
            aliases: [match.toLowerCase()],
            metadata: {
              confidence: 0.7,
              lastUpdated: new Date(),
              sources: ['pattern_extraction']
            }
          });
        }
      }
    }

    return terms;
  }

  private extractMarketSectors(text: string): Entity[] {
    const sectorKeywords = [
      'fintech', 'healthtech', 'edtech', 'proptech', 'insurtech',
      'saas', 'b2b', 'b2c', 'marketplace', 'platform',
      'ai', 'ml', 'blockchain', 'crypto', 'web3'
    ];

    const sectors: Entity[] = [];
    const textLower = text.toLowerCase();

    for (const keyword of sectorKeywords) {
      if (textLower.includes(keyword)) {
        sectors.push({
          id: `sector_${keyword}`,
          name: keyword,
          type: EntityType.MARKET_SECTOR,
          aliases: [keyword],
          metadata: {
            confidence: 0.6,
            lastUpdated: new Date(),
            sources: ['keyword_extraction']
          }
        });
      }
    }

    return sectors;
  }

  private getRequiredInformationTypes(entityType: EntityType): InformationType[] {
    switch (entityType) {
      case EntityType.COMPANY:
        return [
          InformationType.COMPANY_INFO,
          InformationType.FINANCIAL_METRICS,
          InformationType.MARKET_DATA
        ];
      case EntityType.MARKET_SECTOR:
        return [
          InformationType.MARKET_DATA,
          InformationType.INDUSTRY_TRENDS,
          InformationType.COMPETITIVE_ANALYSIS
        ];
      case EntityType.FINANCIAL_TERM:
        return [InformationType.FINANCIAL_METRICS];
      default:
        return [InformationType.MARKET_DATA];
    }
  }

  private calculateGapPriority(entity: Entity, infoType: InformationType, context: string): number {
    let priority = 0.5; // Base priority

    // Increase priority based on entity confidence
    priority += entity.metadata.confidence * 0.2;

    // Increase priority for companies vs other entity types
    if (entity.type === EntityType.COMPANY) {
      priority += 0.2;
    }

    // Increase priority for financial metrics in investment contexts
    if (infoType === InformationType.FINANCIAL_METRICS && 
        context.toLowerCase().includes('investment')) {
      priority += 0.3;
    }

    return Math.min(priority, 1.0);
  }

  private getSuggestedSources(entityType: EntityType, infoType: InformationType): string[] {
    const sources: string[] = [];

    if (entityType === EntityType.COMPANY) {
      sources.push('Crunchbase', 'PitchBook', 'Company website');
      
      if (infoType === InformationType.FINANCIAL_METRICS) {
        sources.push('SEC filings', 'Financial statements');
      }
    }

    if (entityType === EntityType.MARKET_SECTOR) {
      sources.push('Industry reports', 'Market research firms', 'Trade publications');
    }

    return sources;
  }
}