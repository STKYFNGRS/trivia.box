import { config } from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import QuestionService from '@/services/QuestionService';
import ClaudeService from '@/services/ClaudeService';
import { 
  trivia_category, 
  trivia_difficulty, 
  trivia_question_status
} from '@prisma/client';
import { prisma } from '@/lib/db/client';

// Define robust type interfaces
interface BraveSearchResult {
  web: {
    results: Array<{
      title: string;
      description: string;
      url?: string;
    }>;
  };
}

interface ValidationFeedback {
  type: string;
  message: string;
}

interface Question {
  id?: number;
  content: string;
  category: string | trivia_category;
  difficulty: string | trivia_difficulty;
  correct_answer: string;
  incorrect_answers: string[];
  validation_status: trivia_question_status;
  validation_feedback?: ValidationFeedback[];
  ai_generated?: boolean;
  created_at?: Date;
  last_used?: Date | null;
  usage_count?: number;
}

interface QuestionResponse {
  success: boolean;
  data?: Question;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface BatchStats {
  batchNumber: number;
  successCount: number;
  failureCount: number;
  duplicateCount: number;
  categoryDistribution: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  duration: number;
}

interface StatisticsData {
  categoryCount: Record<string, number>;
  difficultyCount: Record<string, number>;
  questionLengths: number[];
  answerLengths: number[];
  generationTime: number[];
  rejectionReasons: Record<string, number>;
  batchStats: BatchStats[];
}

config();

/**
 * Ultimate Question Generator that combines the best features of all previous generators:
 * - Brave Search integration from improvedQuestionGenerator
 * - Category balancing from enhancedQuestionGenerator
 * - Enhanced validation from unifiedQuestionGenerator
 * - Direct DB integration with validation checks
 * - Comprehensive statistics tracking
 */
class UltimateQuestionGenerator {
  private questionService: QuestionService;
  private claudeService: ClaudeService;
  private running: boolean = false;
  private outputPath: string = path.join(process.cwd(), 'generation-stats.json');
  private braveApiKey: string = process.env.BRAVE_API_KEY || '';
  private claudeApiKey: string = process.env.CLAUDE_API_KEY || '';
  private saveToDatabase: boolean = true;

  // Optimized category distribution from enhancedQuestionGenerator
  private readonly categoryDistribution: Record<trivia_category, number> = {
    technology: 0.10,     // Core tech concepts
    science: 0.09,        // Scientific discoveries
    literature: 0.08,     // Books and writing
    pop_culture: 0.12,    // Current trends - increased for wider appeal
    history: 0.09,        // Historical events
    geography: 0.08,      // Global knowledge
    sports: 0.10,         // Sports and esports - increased for mainstream appeal
    gaming: 0.09,         // Video games
    internet: 0.07,       // Web platforms
    movies: 0.10,         // Cinema - increased for mainstream appeal
    music: 0.08          // Music and tech
  }

  // Balanced difficulty distribution for better player engagement
  private readonly difficultyDistribution: Record<trivia_difficulty, number> = {
    [trivia_difficulty.easy]: 0.45,     // More easy questions for confidence
    [trivia_difficulty.medium]: 0.45,   // Equal medium questions for challenge
    [trivia_difficulty.hard]: 0.10      // Fewer hard questions to avoid frustration
  }

  constructor(outputPath?: string, saveToDatabase: boolean = true) {
    this.questionService = QuestionService.getInstance();
    this.claudeService = ClaudeService.getInstance();
    if (outputPath) {
      this.outputPath = outputPath;
    }
    this.saveToDatabase = saveToDatabase;

    // Validate API keys are present
    if (!this.braveApiKey) {
      console.warn('⚠️  WARNING: BRAVE_API_KEY not set. Web search functionality may be limited.');
    }
    
    if (!this.claudeApiKey) {
      console.warn('⚠️  WARNING: CLAUDE_API_KEY not set. This is required for question generation.');
    }
  }

  /**
   * Main method to generate a specified number of questions
   */
  async generateQuestions(config: {
    totalQuestions: number;
    categoriesDistribution?: Record<trivia_category, number>;
    difficultyDistribution?: Record<trivia_difficulty, number>;
    batchSize?: number;
    trackStats?: boolean;
  }): Promise<void> {
    this.running = true;
    const batchSize = config.batchSize || 5;
    let totalGenerated = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalDuplicates = 0;
    const startTime = Date.now();
    const uniqueQuestions = new Set<string>();

    // Initialize statistics tracking
    const stats: StatisticsData = {
      categoryCount: {} as Record<string, number>,
      difficultyCount: {} as Record<string, number>,
      questionLengths: [] as number[],
      answerLengths: [] as number[],
      generationTime: [] as number[],
      rejectionReasons: {} as Record<string, number>,
      batchStats: [] as BatchStats[]
    };

    // Initialize category and difficulty counts
    Object.keys(config.categoriesDistribution || this.categoryDistribution).forEach(category => {
      stats.categoryCount[category] = 0;
    });
    Object.keys(config.difficultyDistribution || this.difficultyDistribution).forEach(difficulty => {
      stats.difficultyCount[difficulty] = 0;
    });

    console.log('Starting ultimate question generation...');
    console.log(`Target: ${config.totalQuestions} questions`);
    console.log('Category Distribution:', config.categoriesDistribution || this.categoryDistribution);
    console.log('Difficulty Distribution:', config.difficultyDistribution || this.difficultyDistribution);
    
    // Main generation loop
    while (this.running && totalGenerated < config.totalQuestions) {
      const currentBatchSize = Math.min(batchSize, config.totalQuestions - totalGenerated);
      console.log(`\nStarting batch ${Math.floor(totalGenerated / batchSize) + 1} of ${Math.ceil(config.totalQuestions / batchSize)}`);
      
      try {
        const batchStartTime = Date.now();
        
        const batchResults = await this.generateBatch({
          batchSize: currentBatchSize,
          categoriesDistribution: config.categoriesDistribution || this.categoryDistribution,
          difficultyDistribution: config.difficultyDistribution || this.difficultyDistribution,
          uniqueQuestions,
          stats
        });

        const batchEndTime = Date.now();
        const batchDuration = (batchEndTime - batchStartTime) / 1000;

        // Update statistics
        totalGenerated += currentBatchSize;
        totalSuccess += batchResults.successCount;
        totalFailed += batchResults.failureCount;
        totalDuplicates += batchResults.duplicateCount;

        // Record batch stats
        stats.batchStats.push({
          batchNumber: Math.floor(totalGenerated / batchSize),
          successCount: batchResults.successCount,
          failureCount: batchResults.failureCount,
          duplicateCount: batchResults.duplicateCount,
          categoryDistribution: { ...batchResults.categoryCount },
          difficultyDistribution: { ...batchResults.difficultyCount },
          duration: batchDuration
        });

        // Print batch summary
        console.log('\nBatch Summary:');
        console.log(`Generated: ${batchResults.successCount}/${currentBatchSize}`);
        console.log(`Failed: ${batchResults.failureCount}`);
        console.log(`Duplicates prevented: ${batchResults.duplicateCount}`);
        console.log(`Batch Duration: ${batchDuration.toFixed(2)} seconds`);
        
        // Print category distribution for this batch
        console.log('\nCategory Distribution:');
        Object.entries(batchResults.categoryCount).forEach(([category, count]) => {
          console.log(`${category}: ${count}`);
        });

        // Print difficulty distribution for this batch
        console.log('\nDifficulty Distribution:');
        Object.entries(batchResults.difficultyCount).forEach(([difficulty, count]) => {
          console.log(`${difficulty}: ${count}`);
        });

        // Cost estimation (assuming $0.04 per question based on previous runs)
        const estimatedCost = (totalSuccess * 0.04).toFixed(2);
        const timeElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        
        console.log('\nProgress Summary:');
        console.log(`Total Success: ${totalSuccess}/${config.totalQuestions} (${(totalSuccess / config.totalQuestions * 100).toFixed(1)}%)`);
        console.log(`Estimated Cost: $${estimatedCost}`);
        console.log(`Time Elapsed: ${timeElapsed} minutes`);
        console.log(`Est. Completion: ${this.estimateCompletion(startTime, totalSuccess, config.totalQuestions)}`);
        
        // Track progress by writing stats to file periodically
        if (config.trackStats && stats.batchStats.length % 5 === 0) {
          await this.writeStatsToFile(stats, totalSuccess, totalFailed, totalDuplicates, startTime);
        }
        
        // Add dynamic delay between batches based on failure rate
        const dynamicDelay = Math.max(3000, batchResults.failureCount * 1000);
        await new Promise(resolve => setTimeout(resolve, dynamicDelay));
      } catch (error) {
        console.error('Batch generation error:', error);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }

    // Final stats recording
    if (config.trackStats) {
      await this.writeStatsToFile(stats, totalSuccess, totalFailed, totalDuplicates, startTime);
    }

    await this.printFinalSummary(totalSuccess, totalFailed, totalDuplicates, startTime, stats);
  }

  /**
   * Generate a batch of questions with improved context and adaptive category/difficulty selection
   */
  private async generateBatch(config: {
    batchSize: number;
    categoriesDistribution: Record<trivia_category, number>;
    difficultyDistribution: Record<trivia_difficulty, number>;
    uniqueQuestions: Set<string>;
    stats: StatisticsData;
  }): Promise<{
    successCount: number;
    failureCount: number;
    duplicateCount: number;
    categoryCount: Record<string, number>;
    difficultyCount: Record<string, number>;
  }> {
    let successCount = 0;
    let failureCount = 0;
    let duplicateCount = 0;
    const categoryCount: Record<string, number> = {};
    const difficultyCount: Record<string, number> = {};

    // Generate questions for this batch
    for (let i = 0; i < config.batchSize; i++) {
      // Adaptively select category and difficulty based on current distribution
      const category = this.selectCategoryAdaptively(
        config.categoriesDistribution, 
        config.stats.categoryCount
      );
      
      const difficulty = this.selectDifficultyAdaptively(
        config.difficultyDistribution, 
        config.stats.difficultyCount
      );

      try {
        // Measure generation time
        const generationStartTime = Date.now();
        
        // First approach: Try to get relevant facts from Brave search
        let questionData: QuestionResponse = { success: false };
        let searchResults: string[] = [];
        
        try {
          // Use Brave search for getting facts if API key is available
          if (this.braveApiKey) {
            searchResults = await this.fetchTriviaFactsFromBrave(category);
            questionData = await this.generateQuestionWithClaude(searchResults, category, difficulty);
          }
        } catch (searchError) {
          console.warn(`Search-based generation failed, falling back to direct generation: ${searchError}`);
        }
        
        // Fallback: If Brave search failed or API key not available, use direct generation
        if (!questionData.success || !questionData.data) {
          console.log('Falling back to direct question generation via QuestionService...');
          
          // Use QuestionService for direct generation
          const context = this.getEnhancedCategoryContext(category);
          questionData = await this.questionService.generateAndValidateQuestion({
            category,
            difficulty,
            context
          });
        }

        // Record generation time
        const generationTime = Date.now() - generationStartTime;
        config.stats.generationTime.push(generationTime);

        // Handle generation failures
        if (!questionData.success || !questionData.data) {
          console.error(`Failed to generate question:`, questionData.error);
          
          // Track rejection reasons
          if (questionData.error?.code) {
            config.stats.rejectionReasons[questionData.error.code] = 
              (config.stats.rejectionReasons[questionData.error.code] || 0) + 1;
          }
          
          failureCount++;
          continue;
        }

        const question = questionData.data;
        
        // Check if answer appears in the question text
        if (this.isAnswerInQuestion(question.content, question.correct_answer)) {
          console.log('Answer found in question text, skipping...');
          config.stats.rejectionReasons['ANSWER_IN_QUESTION'] = 
            (config.stats.rejectionReasons['ANSWER_IN_QUESTION'] || 0) + 1;
          failureCount++;
          continue;
        }
        
        // Track question and answer lengths for quality metrics
        config.stats.questionLengths.push(question.content.length);
        config.stats.answerLengths.push(question.correct_answer.length);
        
        // Enhanced duplicate detection
        const questionKey = `${question.content.toLowerCase().trim()}-${question.correct_answer.toLowerCase().trim()}`;
        const answerSet = new Set([
          question.correct_answer.toLowerCase().trim(),
          ...question.incorrect_answers.map(a => a.toLowerCase().trim())
        ]);
        const answerKey = Array.from(answerSet).sort().join('|');
        
        if (config.uniqueQuestions.has(questionKey) || config.uniqueQuestions.has(answerKey)) {
          console.log('Duplicate question or answer set detected, skipping...');
          duplicateCount++;
          continue;
        }

        // Store both the question content and answer set for duplicate checking
        config.uniqueQuestions.add(questionKey);
        config.uniqueQuestions.add(answerKey);
        
        // Update category and difficulty counts
        categoryCount[category] = (categoryCount[category] || 0) + 1;
        difficultyCount[difficulty] = (difficultyCount[difficulty] || 0) + 1;
        
        // Update global stats
        config.stats.categoryCount[category] = (config.stats.categoryCount[category] || 0) + 1;
        config.stats.difficultyCount[difficulty] = (config.stats.difficultyCount[difficulty] || 0) + 1;
        
        // Save to database if enabled and not already saved by QuestionService
        if (this.saveToDatabase && !question.id) {
          try {
            const savedQuestionId = await this.saveQuestionToDatabase(question);
            if (savedQuestionId) {
              console.log(`✅ Saved to database with ID: ${savedQuestionId}`);
              question.id = savedQuestionId;
            } else {
              console.warn(`⚠️ Question was not saved to database`);
            }
          } catch (dbError) {
            console.error(`❌ Database error:`, dbError);
          }
        }
        
        successCount++;
        
        // Print question details
        console.log(`\nQuestion ${successCount}:`);
        console.log(`[${category}][${difficulty}] ${question.content}`);
        console.log(`✓ ${question.correct_answer}`);
        console.log(`✗ ${question.incorrect_answers.join(', ')}`);
        
        if (question.validation_status === trivia_question_status.reviewing) {
          console.log('Validation Feedback:');
          question.validation_feedback?.forEach(f => {
            console.log(`- [${f.type}] ${f.message}`);
          });
        }

        // Dynamic delay between questions based on API response time
        const delay = Math.max(2000, Math.min(5000, Math.floor(generationTime * 0.5)));
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        console.error(`Error generating question:`, error);
        failureCount++;
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
    }

    return { 
      successCount, 
      failureCount, 
      duplicateCount, 
      categoryCount, 
      difficultyCount 
    };
  }

  /**
   * Save generated question to the database directly
   */
  private async saveQuestionToDatabase(question: Question): Promise<number | null> {
    try {
      // Map the question to the database schema
      const dbQuestion = await prisma.trivia_questions.create({
        data: {
          content: question.content,
          category: this.mapCategoryToEnum(question.category),
          difficulty: this.mapDifficultyToEnum(question.difficulty),
          correct_answer: question.correct_answer,
          incorrect_answers: question.incorrect_answers,
          validation_status: question.validation_status || trivia_question_status.approved,
          created_at: new Date(),
          last_used: null,
          usage_count: 0,
          ai_generated: true,
          validation_feedback: question.validation_feedback ? 
            JSON.stringify(question.validation_feedback) : undefined
        }
      });
      
      return dbQuestion.id;
    } catch (error) {
      console.error('Failed to save question to database:', error);
      return null;
    }
  }

  /**
   * Map text category to trivia_category enum
   */
  private mapCategoryToEnum(category: string | trivia_category): trivia_category {
    // If already an enum value, return as is
    if (Object.values(trivia_category).includes(category as trivia_category)) {
      return category as trivia_category;
    }
    
    // Otherwise normalize text category
    const normalized = String(category).toLowerCase().trim();
    
    // Map to valid enum values
    switch (normalized) {
      case 'technology': return trivia_category.technology;
      case 'science': return trivia_category.science;
      case 'literature': return trivia_category.literature;
      case 'pop_culture':
      case 'general_knowledge': return trivia_category.pop_culture;
      case 'history': return trivia_category.history;
      case 'geography': return trivia_category.geography;
      case 'sports': return trivia_category.sports;
      case 'gaming': return trivia_category.gaming;
      case 'internet': return trivia_category.internet;
      case 'movies': return trivia_category.movies;
      case 'music': return trivia_category.music;
      default:
        // Default to pop_culture if unknown
        console.warn(`Unknown category: ${category}, defaulting to pop_culture`);
        return trivia_category.pop_culture;
    }
  }

  /**
   * Map text difficulty to trivia_difficulty enum
   */
  private mapDifficultyToEnum(difficulty: string | trivia_difficulty): trivia_difficulty {
    // If already an enum value, return as is
    if (Object.values(trivia_difficulty).includes(difficulty as trivia_difficulty)) {
      return difficulty as trivia_difficulty;
    }
    
    // Otherwise normalize text difficulty
    const normalized = String(difficulty).toLowerCase().trim();
    
    // Map to valid enum values
    switch (normalized) {
      case 'easy': return trivia_difficulty.easy;
      case 'medium': return trivia_difficulty.medium;
      case 'hard': return trivia_difficulty.hard;
      default:
        // Default to medium if unknown
        console.warn(`Unknown difficulty: ${difficulty}, defaulting to medium`);
        return trivia_difficulty.medium;
    }
  }

  /**
   * Check if the correct answer appears within the question text (robust implementation)
   */
  private isAnswerInQuestion(questionText: string, answer: string): boolean {
    // Handle null or empty values
    if (!questionText || !answer || questionText.trim() === '' || answer.trim() === '') {
      return false;
    }
    
    // Convert both to lowercase for case-insensitive comparison
    const questionLower = questionText.toLowerCase();
    const answerLower = answer.toLowerCase();
    
    // 1. Direct substring check
    if (questionLower.includes(answerLower)) {
      return true;
    }
    
    // 2. Check for word boundaries to avoid partial matches
    const answerPattern = new RegExp(`\\b${this.escapeRegExp(answerLower)}\\b`, 'i');
    if (answerPattern.test(questionLower)) {
      return true;
    }
    
    // 3. Check for plural forms or common variants
    const answerParts = answerLower.split(/\s+/);
    if (answerParts.length > 1) {
      // For multi-word answers, check if significant parts appear in the question
      for (const part of answerParts) {
        // Skip very short parts and common words
        if (part.length > 3 && !this.isCommonWord(part)) {
          const partPattern = new RegExp(`\\b${this.escapeRegExp(part)}\\b`, 'i');
          if (partPattern.test(questionLower)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Escape special characters for use in regular expression
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if the word is too common to be considered a unique answer identifier
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'and', 'that', 'have', 'for', 'not', 'with', 'this', 'but', 
      'from', 'they', 'will', 'would', 'there', 'their', 'what', 'about', 
      'which', 'when', 'were', 'some', 'into', 'other', 'your', 'more'
    ]);
    
    return commonWords.has(word.toLowerCase());
  }

  /**
   * Fetch trivia-related facts from Brave Search API
   */
  private async fetchTriviaFactsFromBrave(category: string): Promise<string[]> {
    // Category-specific search queries to get targeted results
    const categoryQueries: Record<string, string[]> = {
      technology: [
        'fascinating technology facts',
        'surprising computer history',
        'tech invention stories',
        'tech history milestones',
        'interesting tech trivia'
      ],
      science: [
        'surprising science discoveries',
        'amazing science facts',
        'unusual scientific breakthroughs',
        'mind-blowing science trivia',
        'unexpected science history'
      ],
      literature: [
        'surprising facts about famous books',
        'interesting author trivia',
        'unexpected literature history',
        'famous book secrets',
        'literary world trivia'
      ],
      pop_culture: [
        'surprising celebrity facts',
        'pop culture trivia secrets',
        'unexpected entertainment history',
        'fascinating celebrity trivia',
        'interesting entertainment facts'
      ],
      history: [
        'surprising historical facts',
        'unusual history trivia',
        'lesser-known historical events',
        'amazing history discoveries',
        'strange but true history'
      ],
      geography: [
        'surprising country facts',
        'unusual geographical features',
        'unexpected place names origins',
        'amazing geography trivia',
        'strange places in the world'
      ],
      sports: [
        'unusual sports facts',
        'surprising sports history',
        'sports world records trivia',
        'unexpected sports rules',
        'interesting athlete facts'
      ],
      gaming: [
        'surprising video game facts',
        'interesting gaming history',
        'unexpected facts about famous games',
        'video game development secrets',
        'gaming easter eggs trivia'
      ],
      internet: [
        'surprising internet history',
        'interesting social media facts',
        'unexpected web development stories',
        'internet meme origins',
        'website history trivia'
      ],
      movies: [
        'surprising movie production facts',
        'interesting film history',
        'unexpected movie trivia',
        'film production secrets',
        'famous actor trivia'
      ],
      music: [
        'surprising music history facts',
        'interesting musician trivia',
        'unexpected recording facts',
        'famous song backstories',
        'music industry secrets'
      ]
    };
    
    // Get queries for the requested category or use default
    const queries = categoryQueries[category] || [
      'interesting trivia facts',
      'surprising facts trivia',
      'amazing trivia questions',
      'unexpected trivia answers',
      'fascinating facts quiz'
    ];
    
    // Select a random query
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];
    
    try {
      console.log(`Searching Brave for: "${randomQuery}"...`);
      
      // Call the Brave Search API
      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(randomQuery)}`, 
        {
          headers: {
            'X-Subscription-Token': this.braveApiKey,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Brave Search API error: ${response.statusText}`);
      }

      const data = await response.json() as BraveSearchResult;
      
      // Process the search results
      if (!data.web || !data.web.results || data.web.results.length === 0) {
        throw new Error('No search results found');
      }
      
      // Extract titles and descriptions
      const results: string[] = [];
      data.web.results.forEach(result => {
        if (result.title) results.push(result.title);
        if (result.description) results.push(result.description);
      });
      
      console.log(`Found ${results.length} search results to use as source material`);
      return results;
    } catch (error) {
      console.error('Brave search error:', error);
      // Fallback to default facts in case of API failure
      return [
        `Looking for interesting facts about ${category}`,
        `Amazing trivia about ${category}`,
        `Surprising ${category} knowledge`
      ];
    }
  }

  /**
   * Generate a trivia question using Claude API with search results as context
   */
  private async generateQuestionWithClaude(
    searchResults: string[], 
    category: string,
    difficulty: string
  ): Promise<QuestionResponse> {
    const prompt = `Generate a ${difficulty} trivia question about ${category} based on the following search results.
Your response MUST be in valid JSON format with this EXACT structure:

{
  "success": true,
  "data": {
    "content": "Question text here (1-2 sentences)",
    "category": "${category}",
    "difficulty": "${difficulty}",
    "correct_answer": "Correct answer here (keep brief, 1-5 words)",
    "incorrect_answers": ["Wrong answer 1", "Wrong answer 2", "Wrong answer 3"],
    "validation_status": "approved"
  }
}

Requirements:
- Questions must be 1-2 sentences
- Answers must be 1-5 words maximum
- Make the question interesting and suitable for a trivia game
- All answers must be distinct from each other
- Focus on verified facts, avoid subjective or debatable answers
- CRITICAL: The correct answer must NOT appear in the question text

For example, this is a BAD question:
"The Guinness Book of World Records was originally created by the Guinness beer company to settle bar disputes."
with the answer "Guinness" - because the answer is in the question.

A better version would be:
"This beer company created a famous book of records originally intended to settle pub disputes."
with the answer "Guinness"

Here are the search results to base your question on:
${searchResults.join('\n').substring(0, 1500)}

IMPORTANT: Return ONLY valid JSON with NO extra text or explanation.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API call failed with status: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.content?.[0]?.text || '';
      
      // Extract JSON from Claude's response
      let jsonResponse;
      try {
        // First try to parse the entire response as JSON
        jsonResponse = JSON.parse(responseText.trim());
        console.log("Successfully parsed complete JSON response");
      } catch (error) {
        console.log("Failed to parse entire response as JSON, trying to extract JSON...");
        console.log("Parse error:", error instanceof Error ? error.message : String(error));
        
        // Try multiple regex patterns to extract JSON
        let jsonMatch: RegExpMatchArray | null = null;
        
        // Pattern 1: Extract JSON from code blocks ```json ... ```
        jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]+?\})\s*```/);
        
        // Pattern 2: If that fails, look for any content between { and }
        if (!jsonMatch) {
          const jsonRegex = /(\{[\s\S]+\})/g;
          const matches = responseText.match(jsonRegex);
          if (matches && matches.length > 0) {
            // Try each match until one parses successfully
            for (const match of matches) {
            try {
              JSON.parse(match);
              jsonMatch = [match, match];
              break;
            } catch {
              // Continue to next match
            }
            }
          }
        }
        
        if (jsonMatch) {
          try {
            const jsonContent = jsonMatch[1] ? jsonMatch[1].trim() : jsonMatch[0].trim();
            jsonResponse = JSON.parse(jsonContent);
            console.log("Successfully extracted and parsed JSON");
          } catch (innerError) {
            console.error("Failed to extract JSON from Claude's response:", innerError);
            return {
              success: false,
              error: {
                code: 'PARSE_ERROR',
                message: 'Failed to parse JSON from Claude response'
              }
            };
          }
        } else {
          console.error("No JSON found in Claude's response");
          return {
            success: false,
            error: {
              code: 'NO_JSON_FOUND',
              message: 'No JSON found in Claude response'
            }
          };
        }
      }

      // Validate the structure of the JSON
      if (!jsonResponse.success || !jsonResponse.data) {
        console.error("JSON response missing required fields");
        return {
          success: false,
          error: {
            code: 'INVALID_STRUCTURE',
            message: 'JSON response missing required fields'
          }
        };
      }
      
      // Check for missing required question fields
      const requiredFields = ['content', 'category', 'difficulty', 'correct_answer', 'incorrect_answers'];
      const missingFields = requiredFields.filter(field => !jsonResponse.data[field]);
      
      if (missingFields.length > 0) {
        console.error(`JSON response missing fields: ${missingFields.join(', ')}`);
        return {
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: `JSON response missing required fields: ${missingFields.join(', ')}`
          }
        };
      }

      return jsonResponse as QuestionResponse;
    } catch (error) {
      console.error('Claude API error:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Select category adaptively to ensure balanced distribution
   */
  private selectCategoryAdaptively(
    distribution: Record<trivia_category, number>,
    currentCounts: Record<string, number>
  ): trivia_category {
    // Calculate total questions generated so far
    let totalGenerated = 0;
    for (const count of Object.values(currentCounts)) {
      totalGenerated += count || 0;
    }
    
    if (totalGenerated < 20) {
      // For the first few questions, use the base distribution
      return this.selectBasedOnDistribution(distribution);
    }

    // Calculate the target number for each category
    const targetDistribution: Record<string, number> = {};
    const categories = Object.keys(distribution) as trivia_category[];
    
    categories.forEach(category => {
      targetDistribution[category] = distribution[category] * totalGenerated;
    });
    
    // Calculate how far each category is from its target
    const categoryDeficits: Record<string, number> = {};
    categories.forEach(category => {
      const target = targetDistribution[category];
      const current = currentCounts[category] || 0;
      categoryDeficits[category] = target - current;
    });
    
    // Create a weighted distribution favoring categories that are below target
    const adaptiveDistribution: Record<trivia_category, number> = {} as Record<trivia_category, number>;
    
    categories.forEach(category => {
      const deficit = categoryDeficits[category];
      // If category is behind, give it higher weight
      if (deficit > 0) {
        adaptiveDistribution[category] = distribution[category] * (1 + deficit / 5);
      } else {
        // If category is at or ahead of target, give it lower weight
        adaptiveDistribution[category] = distribution[category] * 0.5;
      }
    });
    
    return this.selectBasedOnDistribution(adaptiveDistribution);
  }

  /**
   * Select difficulty adaptively to ensure balanced distribution
   */
  private selectDifficultyAdaptively(
    distribution: Record<trivia_difficulty, number>,
    currentCounts: Record<string, number>
  ): trivia_difficulty {
    // Calculate total questions generated so far
    let totalGenerated = 0;
    for (const count of Object.values(currentCounts)) {
      totalGenerated += count || 0;
    }
    
    if (totalGenerated < 20) {
      // For the first few questions, use the base distribution
      return this.selectBasedOnDistribution(distribution);
    }

    // Calculate the target number for each difficulty
    const targetDistribution: Record<string, number> = {};
    const difficulties = Object.keys(distribution) as trivia_difficulty[];
    
    difficulties.forEach(difficulty => {
      targetDistribution[difficulty] = distribution[difficulty] * totalGenerated;
    });
    
    // Calculate how far each difficulty is from its target
    const difficultyDeficits: Record<string, number> = {};
    difficulties.forEach(difficulty => {
      const target = targetDistribution[difficulty];
      const current = currentCounts[difficulty] || 0;
      difficultyDeficits[difficulty] = target - current;
    });
    
    // Create a weighted distribution favoring difficulties that are below target
    const adaptiveDistribution: Record<trivia_difficulty, number> = {} as Record<trivia_difficulty, number>;
    
    difficulties.forEach(difficulty => {
      const deficit = difficultyDeficits[difficulty];
      // If difficulty is behind, give it higher weight
      if (deficit > 0) {
        adaptiveDistribution[difficulty] = distribution[difficulty] * (1 + deficit / 5);
      } else {
        // If difficulty is at or ahead of target, give it lower weight
        adaptiveDistribution[difficulty] = distribution[difficulty] * 0.5;
      }
    });
    
    return this.selectBasedOnDistribution(adaptiveDistribution);
  }

  /**
   * Select an item based on a probability distribution
   */
  private selectBasedOnDistribution<T extends string>(distribution: Record<T, number>): T {
    const values = Object.values(distribution) as number[];
    const total = values.reduce((sum, value) => sum + value, 0);
    let random = Math.random() * total;
    
    const entries = Object.entries(distribution) as Array<[T, number]>;
    for (const [key, value] of entries) {
      random -= value;
      if (random <= 0) {
        return key;
      }
    }
    
    return entries[0][0];
  }

  /**
   * Enhanced category contexts optimized for engaging questions
   */
  private getEnhancedCategoryContext(category: string): string {
    switch (category) {
      case 'technology':
        return `Focus areas for engaging tech questions:
- Tech fails and unexpected consequences
- Quirky startup stories and founder anecdotes
- AI doing surprising things
- Tech that seemed futuristic but flopped
- Hidden features in everyday devices
- Easter eggs in popular software
- Strange patents and weird innovations
- Behind-the-scenes tech industry drama
- Tech predictions that were hilariously wrong`;

      case 'science':
        return `Focus areas for engaging science questions:
- Weird scientific discoveries
- Animals with unexpected abilities
- Space exploration surprises
- Failed experiments that led to breakthroughs
- Scientists who were ahead of their time
- Nature's oddities and mysteries
- Accidental discoveries
- Mind-bending quantum facts
- "Wait, that's actually true?" science facts`;

      case 'pop_culture':
        return `Focus areas for engaging pop culture questions:
- Viral moments and their aftermath
- Celebrity tech ventures
- Social media milestones
- Influencer impact stories
- Unexpected brand collaborations
- Platform wars and drama
- Reality TV tech moments
- Cultural phenomena origins
- Brand marketing campaigns that went viral`;

      case 'history':
        return `Focus areas for engaging history questions:
- Historical figures with surprising connections to modern life
- History facts that sound fake but are real
- Origin stories of everyday objects and customs
- Historical coincidences that seem impossible
- Surprising historical firsts that most don't know
- Weird laws that actually existed
- Unexpected historical friendships and rivalries
- History behind common phrases we still use`;

      case 'geography':
        return `Focus areas for engaging geography questions:
- Strange borders and geographical oddities
- Amazing natural wonders most haven't heard of
- Surprising facts about famous landmarks
- Countries with unexpected features or laws
- Cities with surprising sister cities
- Geography behind popular vacation destinations
- Islands with unique characteristics
- Geographical name origins with surprising stories`;

      case 'sports':
        return `Focus areas for engaging sports questions:
- Weird sports rules most fans don't know
- Surprising athlete career changes
- Sports traditions with unexpected origins
- Record-breaking sports moments everyone remembers
- Sports team name origins and meanings
- Athlete superstitions and pre-game rituals
- Surprising sports facts from the Olympics
- Unusual sports played around the world`;

      case 'gaming':
        return `Focus areas for engaging gaming questions:
- Easter eggs in popular games everyone's played
- Hidden features in classic video games
- Gaming world records anyone can appreciate
- Origin stories of iconic game characters
- Mobile gaming surprising facts and milestones
- Gaming references in movies and TV shows
- Failed gaming products with interesting stories
- Gaming industry statistics that surprise non-gamers`;

      case 'internet':
        return `Focus areas for engaging internet questions:
- Popular website origin stories
- Internet meme origins and evolutions
- Social media features' surprising origins
- Viral video backstories
- Early internet culture everyone remembers
- Email and messaging platform evolution
- Internet trends that disappeared suddenly
- Domain name battles and interesting sales`;

      case 'movies':
        return `Focus areas for engaging movie questions:
- Movie mistakes in blockbusters everyone's seen
- Famous movie quotes most people misremember
- Surprising cameos in popular films
- Movie sequel facts that surprise most viewers
- Alternate endings to famous movies
- Surprising behind-the-scenes movie facts
- Movies based on surprising true stories
- Actors who nearly played iconic roles`;

      case 'music':
        return `Focus areas for engaging music questions:
- Hidden messages in popular songs
- One-hit wonder surprising facts
- Band name origins with unexpected stories
- Songs with misunderstood lyrics everyone gets wrong
- Surprising artist collaborations
- Music video secrets and interesting facts
- Songs that went viral for unexpected reasons
- Music streaming records and milestones`;

      case 'literature':
        return `Focus areas for engaging literature questions:
- Famous books with surprising origins
- Bestseller facts that surprise casual readers
- Children's books with unexpected messages
- Book-to-movie adaptation differences
- Author pseudonyms and their reasons
- Rejected manuscripts that became classics
- Surprising connections between famous books
- Books banned for unexpected reasons`;

      default:
        return 'Focus on verified facts and surprising connections within this topic area.';
    }
  }

  /**
   * Calculate and display estimated completion time based on current progress
   */
  private estimateCompletion(startTime: number, currentCount: number, totalCount: number): string {
    if (currentCount === 0) return 'Calculating...';
    
    const elapsedMs = Date.now() - startTime;
    const msPerQuestion = elapsedMs / currentCount;
    const remainingQuestions = totalCount - currentCount;
    const estimatedRemainingMs = msPerQuestion * remainingQuestions;
    
    // Convert to minutes or hours as appropriate
    if (estimatedRemainingMs < 60 * 60 * 1000) {
      const remainingMinutes = Math.ceil(estimatedRemainingMs / (60 * 1000));
      return `~${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    } else {
      const remainingHours = (estimatedRemainingMs / (60 * 60 * 1000)).toFixed(1);
      return `~${remainingHours} hour${remainingHours !== '1.0' ? 's' : ''}`;
    }
  }

  /**
   * Write generation stats to a file for analysis
   */
  private async writeStatsToFile(
    stats: StatisticsData,
    totalSuccess: number,
    totalFailed: number,
    totalDuplicates: number,
    startTime: number
  ): Promise<void> {
    try {
      const timeElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      
      // Calculate averages safely
      let avgGenerationTime = '0.00';
      if (stats.generationTime && stats.generationTime.length > 0) {
        let total = 0;
        for (const time of stats.generationTime) {
          total += time;
        }
        avgGenerationTime = ((total / stats.generationTime.length) / 1000).toFixed(2);
      }
      
      let avgQuestionLength = '0.0';
      if (stats.questionLengths && stats.questionLengths.length > 0) {
        let total = 0;
        for (const length of stats.questionLengths) {
          total += length;
        }
        avgQuestionLength = (total / stats.questionLengths.length).toFixed(1);
      }
      
      let avgAnswerLength = '0.0';
      if (stats.answerLengths && stats.answerLengths.length > 0) {
        let total = 0;
        for (const length of stats.answerLengths) {
          total += length;
        }
        avgAnswerLength = (total / stats.answerLengths.length).toFixed(1);
      }
      
      const summaryStats = {
        summary: {
          totalSuccess,
          totalFailed,
          totalDuplicates,
          timeElapsed: `${timeElapsed} minutes`,
          avgGenerationTime,
          avgQuestionLength,
          avgAnswerLength,
        },
        categoryDistribution: stats.categoryCount,
        difficultyDistribution: stats.difficultyCount,
        rejectionReasons: stats.rejectionReasons,
        batchStats: stats.batchStats
      };
      
      await fs.writeFile(this.outputPath, JSON.stringify(summaryStats, null, 2));
    } catch (error) {
      console.error('Error writing stats to file:', error);
    }
  }

  /**
   * Print comprehensive final summary with stats
   */
  private async printFinalSummary(
    totalSuccess: number,
    totalFailed: number,
    totalDuplicates: number,
    startTime: number,
    stats: StatisticsData
  ): Promise<void> {
    const timeElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const estimatedCost = (totalSuccess * 0.04).toFixed(2);

    console.log('\n===== FINAL GENERATION SUMMARY =====');
    console.log(`Total Questions Generated: ${totalSuccess}`);
    console.log(`Failed Attempts: ${totalFailed}`);
    console.log(`Duplicates Prevented: ${totalDuplicates}`);
    console.log(`Time Elapsed: ${timeElapsed} minutes`);
    console.log(`Estimated Cost: ${estimatedCost}`);

    // Print advanced statistics (safely)
    if (stats.generationTime && stats.generationTime.length > 0) {
      let total = 0;
      for (const time of stats.generationTime) {
        total += time;
      }
      const avgGenerationTime = total / stats.generationTime.length;
      console.log(`Average Generation Time: ${(avgGenerationTime / 1000).toFixed(2)} seconds`);
    }
    
    if (stats.questionLengths && stats.questionLengths.length > 0) {
      let total = 0;
      for (const length of stats.questionLengths) {
        total += length;
      }
      const avgQuestionLength = total / stats.questionLengths.length;
      console.log(`Average Question Length: ${avgQuestionLength.toFixed(1)} characters`);
    }
    
    if (stats.answerLengths && stats.answerLengths.length > 0) {
      let total = 0;
      for (const length of stats.answerLengths) {
        total += length;
      }
      const avgAnswerLength = total / stats.answerLengths.length;
      console.log(`Average Answer Length: ${avgAnswerLength.toFixed(1)} characters`);
    }

    // Print category distribution
    console.log('\nCategory Distribution:');
    const categories = Object.keys(stats.categoryCount).sort();
    
    // Calculate total questions safely
    let totalQuestions = 0;
    for (const category of categories) {
      const count = stats.categoryCount[category] || 0;
      totalQuestions += count;
    }
    
    // Print each category
    for (const category of categories) {
      const count = stats.categoryCount[category] || 0;
      const percentage = totalQuestions > 0 ? (count / totalQuestions * 100).toFixed(1) : '0.0';
      console.log(`${category.padEnd(12)}: ${count.toString().padStart(4)} (${percentage}%)`);
    }

    // Print difficulty distribution
    console.log('\nDifficulty Distribution:');
    const difficulties = Object.keys(stats.difficultyCount).sort();
    
    for (const difficulty of difficulties) {
      const count = stats.difficultyCount[difficulty] || 0;
      const percentage = totalQuestions > 0 ? (count / totalQuestions * 100).toFixed(1) : '0.0';
      console.log(`${difficulty.padEnd(12)}: ${count.toString().padStart(4)} (${percentage}%)`);
    }

    // Print rejection reasons if any
    if (stats.rejectionReasons && Object.keys(stats.rejectionReasons).length > 0) {
      console.log('\nRejection Reasons:');
      
      // Convert to array and sort by count
      const reasonEntries: [string, number][] = [];
      for (const reason in stats.rejectionReasons) {
        const count = stats.rejectionReasons[reason];
        if (typeof count === 'number') {
          reasonEntries.push([reason, count]);
        }
      }
      
      // Sort by count (highest first)
      reasonEntries.sort((a, b) => b[1] - a[1]);
      
      // Print each reason
      for (const [reason, count] of reasonEntries) {
        console.log(`${reason.padEnd(20)}: ${count}`);
      }
    }
    
    // Database statistics if enabled
    if (this.saveToDatabase) {
      try {
        const totalDbQuestions = await prisma.trivia_questions.count({
          where: {
            ai_generated: true,
            validation_status: trivia_question_status.approved
          }
        });
        
        console.log(`\nDatabase Statistics:`);
        console.log(`Total AI-generated questions in database: ${totalDbQuestions}`);
      } catch (dbError) {
        console.error('Failed to retrieve database stats:', dbError);
      }
    }
  }

  stop(): void {
    this.running = false;
    console.log('Stopping question generation gracefully...');
  }
}

/**
 * Run the Ultimate Question Generator with improved settings
 */
async function runUltimateGeneration() {
  const generator = new UltimateQuestionGenerator();
  
  await generator.generateQuestions({
    totalQuestions: 5000,
    categoriesDistribution: {
      technology: 0.10,     // Core tech concepts
      science: 0.09,        // Scientific discoveries
      literature: 0.08,     // Books and writing
      pop_culture: 0.12,    // Current trends - increased for wider appeal
      history: 0.09,        // Historical events
      geography: 0.08,      // Global knowledge
      sports: 0.10,         // Sports and esports - increased for mainstream appeal
      gaming: 0.09,         // Video games
      internet: 0.07,       // Web platforms
      movies: 0.10,         // Cinema - increased for mainstream appeal
      music: 0.08          // Music and tech
    },
    difficultyDistribution: {
      [trivia_difficulty.easy]: 0.45,    // More easy questions for confidence
      [trivia_difficulty.medium]: 0.45,  // Equal medium questions for challenge
      [trivia_difficulty.hard]: 0.10     // Fewer hard questions to avoid frustration
    },
    trackStats: true,
    batchSize: 5  // Smaller batches for better monitoring
  });
}

if (require.main === module) {
  runUltimateGeneration().catch(console.error);
}

export default UltimateQuestionGenerator;