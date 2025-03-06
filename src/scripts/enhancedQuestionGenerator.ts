import { config } from 'dotenv';
import QuestionService from '@/services/QuestionService';
import { trivia_category, trivia_difficulty, trivia_question_status } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';

config();

/**
 * Enhanced Question Generator with improved category balance, difficulty calibration,
 * and focus on crowd-friendly, engaging questions
 */
class EnhancedQuestionGenerator {
  private questionService: QuestionService;
  private running: boolean = false;
  private outputPath: string = path.join(process.cwd(), 'generation-stats.json');
  
  // Updated category distribution for broader appeal
  private readonly categoryDistribution: Record<trivia_category, number> = {
    technology: 0.10,     // Reduced slightly to balance
    science: 0.09,        // Engaging science facts
    literature: 0.08,     // Reduced slightly, focus on popular works
    pop_culture: 0.12,    // INCREASED for wider appeal
    history: 0.09,        // Engaging historical moments
    geography: 0.08,      // Interesting places and facts
    sports: 0.10,         // INCREASED for mainstream appeal
    gaming: 0.09,         // Popular games and culture
    internet: 0.07,       // Focused on memes and viral moments
    movies: 0.10,         // INCREASED for mainstream appeal
    music: 0.08          // Popular music knowledge
  }

  // Adjusted difficulty distribution for better player engagement
  private readonly difficultyDistribution: Record<trivia_difficulty, number> = {
    [trivia_difficulty.easy]: 0.45,     // Slightly more easy questions for player confidence
    [trivia_difficulty.medium]: 0.45,   // Equal medium questions for engagement
    [trivia_difficulty.hard]: 0.10      // Fewer hard questions to avoid frustration
  }

  constructor(outputPath?: string) {
    this.questionService = QuestionService.getInstance();
    if (outputPath) {
      this.outputPath = outputPath;
    }
  }

  /**
   * Generate questions with enhanced distribution and tracking
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
    
    // Statistics tracking
    const stats = {
      categoryCount: {} as Record<string, number>,
      difficultyCount: {} as Record<string, number>,
      questionLengths: [] as number[],
      answerLengths: [] as number[],
      generationTime: [] as number[],
      rejectionReasons: {} as Record<string, number>,
      batchStats: [] as any[]
    };

    // Initialize category and difficulty counts
    Object.keys(this.categoryDistribution).forEach(category => {
      stats.categoryCount[category] = 0;
    });
    Object.keys(this.difficultyDistribution).forEach(difficulty => {
      stats.difficultyCount[difficulty] = 0;
    });

    console.log('Starting enhanced question generation...');
    console.log(`Target: ${config.totalQuestions} questions`);
    console.log('Category Distribution:', config.categoriesDistribution || this.categoryDistribution);
    console.log('Difficulty Distribution:', config.difficultyDistribution || this.difficultyDistribution);
    
    while (this.running && totalGenerated < config.totalQuestions) {
      const currentBatchSize = Math.min(batchSize, config.totalQuestions - totalGenerated);
      console.log(`\nStarting batch ${Math.floor(totalGenerated / batchSize) + 1}`);
      
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
        console.log(`Total Success: ${totalSuccess}/${config.totalQuestions}`);
        console.log(`Estimated Cost: $${estimatedCost}`);
        console.log(`Time Elapsed: ${timeElapsed} minutes`);
        
        // Track progress by writing stats to file periodically
        if (config.trackStats && stats.batchStats.length % 5 === 0) {
          await this.writeStatsToFile(stats, totalSuccess, totalFailed, totalDuplicates, startTime);
        }
        
        // Add delay between batches to prevent rate limiting
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
   * Generate a batch of questions with improved context focusing on crowd-friendly topics
   */
  private async generateBatch(config: {
    batchSize: number;
    categoriesDistribution: Record<trivia_category, number>;
    difficultyDistribution: Record<trivia_difficulty, number>;
    uniqueQuestions: Set<string>;
    stats: any;
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

    for (let i = 0; i < config.batchSize; i++) {
      // Adaptively select categories based on current distribution
      const category = this.selectCategoryAdaptively(config.categoriesDistribution, config.stats.categoryCount);
      const difficulty = this.selectDifficultyAdaptively(config.difficultyDistribution, config.stats.difficultyCount);

      try {
        const generationStartTime = Date.now();
        
        const result = await this.questionService.generateAndValidateQuestion({
          category,
          difficulty,
          context: this.getEnhancedCategoryContext(category)
        });

        const generationTime = Date.now() - generationStartTime;
        config.stats.generationTime.push(generationTime);

        if (!result.success || !result.data) {
          console.error(`Failed to generate question:`, result.error);
          
          // Track rejection reasons
          if (result.error?.code) {
            config.stats.rejectionReasons[result.error.code] = 
              (config.stats.rejectionReasons[result.error.code] || 0) + 1;
          }
          
          failureCount++;
          continue;
        }

        const question = result.data;
        
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
   * Enhanced category contexts optimized for crowd-friendly, engaging questions
   */
  private getEnhancedCategoryContext(category: trivia_category): string {
    switch (category) {
      case 'technology':
        return `Focus areas for crowd-friendly tech questions:
- Tech failures that became success stories
- Tech easter eggs and hidden features everyone can find
- Tech myths debunked (e.g. "Do phones really cause cancer?")
- Origin stories of everyday tech we all use
- Surprising tech facts about social media platforms
- Tech behind viral moments and popular apps
- Unexpected uses of common technology
- Tech predictions that were hilariously wrong
- Surprising tech in movies and TV shows
- Tech that changed how we communicate daily
- Cool Bluetooth device features most people don't know about`;

      case 'science':
        return `Focus areas for crowd-friendly science questions:
- "Wait, that's actually true?" science facts
- Animal abilities that seem like superpowers
- Everyday science misconceptions
- Food science everyone experiences
- Human body facts that surprise most people
- Weather phenomena explained simply
- Science behind viral videos and trends
- Space facts that blow people's minds
- Scientific explanations for common experiences
- Science myths from movies vs. reality
- Science behind common phobias and fears
- Unexpected animal behaviors and adaptations`;

      case 'pop_culture':
        return `Focus areas for crowd-friendly pop culture questions:
- Viral social media moments everyone remembers
- Celebrity tech products and endorsements
- Popular memes and their origins
- TV show secrets and behind-the-scenes facts
- Reality TV surprising moments
- Famous brand logo changes and their stories
- Surprising celebrity friendships and connections
- Social media records and milestones
- Pop culture references in other media
- Celebrity career changes that surprised fans
- Brand marketing campaigns that went viral
- Unexpected product placement in popular media`;

      case 'history':
        return `Focus areas for crowd-friendly history questions:
- Historical figures with surprising connections to modern life
- History facts that sound fake but are real
- Origin stories of everyday objects and customs
- Historical coincidences that seem impossible
- Surprising historical firsts that most don't know
- Weird laws that actually existed
- Unexpected historical friendships and rivalries
- History behind common phrases we still use
- Historical events that happened on the same day
- History of foods and drinks we consume daily
- Surprising historical uses for common items
- Historical misconceptions from popular movies`;

      case 'geography':
        return `Focus areas for crowd-friendly geography questions:
- Strange borders and geographical oddities
- Amazing natural wonders most haven't heard of
- Surprising facts about famous landmarks
- Countries with unexpected features or laws
- Cities with surprising sister cities
- Geography behind popular vacation destinations
- Islands with unique characteristics
- Geographical name origins with surprising stories
- Places with extreme or unusual weather
- Surprising capital cities and their stories
- Geographical misconceptions most people believe
- Unique geographical features in popular tourist spots`;

      case 'sports':
        return `Focus areas for crowd-friendly sports questions:
- Weird sports rules most fans don't know
- Surprising athlete career changes
- Sports traditions with unexpected origins
- Record-breaking sports moments everyone remembers
- Sports team name origins and meanings
- Athlete superstitions and pre-game rituals
- Surprising sports facts from the Olympics
- Unusual sports played around the world
- Sports equipment evolution and innovations
- Unexpected connections between different sports
- Famous sports "curses" and coincidences
- Sports mascot origins and stories`;

      case 'gaming':
        return `Focus areas for crowd-friendly gaming questions:
- Easter eggs in popular games everyone's played
- Hidden features in classic video games
- Gaming world records anyone can appreciate
- Origin stories of iconic game characters
- Mobile gaming surprising facts and milestones
- Gaming references in movies and TV shows
- Failed gaming products with interesting stories
- Gaming industry statistics that surprise non-gamers
- Crossovers between games and other media
- Gaming myths debunked
- Classic arcade game secrets and stories
- Board game facts and surprising origins`;

      case 'internet':
        return `Focus areas for crowd-friendly internet questions:
- Popular website origin stories
- Internet meme origins and evolutions
- Social media features' surprising origins
- Viral video backstories
- Early internet culture everyone remembers
- Email and messaging platform evolution
- Internet trends that disappeared suddenly
- Domain name battles and interesting sales
- Website redesigns that caused outrage
- Internet April Fools' pranks everyone fell for
- Popular internet challenges and their impacts
- Internet security facts everyone should know`;

      case 'movies':
        return `Focus areas for crowd-friendly movie questions:
- Movie mistakes in blockbusters everyone's seen
- Famous movie quotes most people misremember
- Surprising cameos in popular films
- Movie sequel facts that surprise most viewers
- Alternate endings to famous movies
- Surprising behind-the-scenes movie facts
- Movies based on surprising true stories
- Actors who nearly played iconic roles
- Movie props with interesting histories
- Surprising box office facts and records
- Famous movie scenes improvised by actors
- On-set accidents that made it into films`;

      case 'music':
        return `Focus areas for crowd-friendly music questions:
- Hidden messages in popular songs
- One-hit wonder surprising facts
- Band name origins with unexpected stories
- Songs with misunderstood lyrics everyone gets wrong
- Surprising artist collaborations
- Music video secrets and interesting facts
- Songs that went viral for unexpected reasons
- Music streaming records and milestones
- Musical instruments with surprising histories
- Grammy award surprising facts and controversies
- Chart-topping songs originally written for others
- Music festival facts and surprising moments`;

      case 'literature':
        return `Focus areas for crowd-friendly literature questions:
- Famous books with surprising origins
- Bestseller facts that surprise casual readers
- Children's books with unexpected messages
- Book-to-movie adaptation differences
- Author pseudonyms and their reasons
- Rejected manuscripts that became classics
- Surprising connections between famous books
- Books banned for unexpected reasons
- Literary characters based on real people
- Book cover design stories and changes
- Surprising author careers before writing
- Unexpected inspirations for famous stories`;

      default:
        return '';
    }
  }

  /**
   * Write generation stats to a file for analysis
   */
  private async writeStatsToFile(
    stats: any,
    totalSuccess: number,
    totalFailed: number,
    totalDuplicates: number,
    startTime: number
  ): Promise<void> {
    try {
      const timeElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      
      // Calculate averages safely
      let avgGenerationTime = "0.00";
      if (stats.generationTime && stats.generationTime.length > 0) {
        let total = 0;
        for (const time of stats.generationTime) {
          total += time;
        }
        avgGenerationTime = ((total / stats.generationTime.length) / 1000).toFixed(2);
      }
      
      let avgQuestionLength = "0.0";
      if (stats.questionLengths && stats.questionLengths.length > 0) {
        let total = 0;
        for (const length of stats.questionLengths) {
          total += length;
        }
        avgQuestionLength = (total / stats.questionLengths.length).toFixed(1);
      }
      
      let avgAnswerLength = "0.0";
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
    stats: any
  ): Promise<void> {
    const timeElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const estimatedCost = (totalSuccess * 0.04).toFixed(2);

    console.log('\n===== FINAL GENERATION SUMMARY =====');
    console.log(`Total Questions Generated: ${totalSuccess}`);
    console.log(`Failed Attempts: ${totalFailed}`);
    console.log(`Duplicates Prevented: ${totalDuplicates}`);
    console.log(`Time Elapsed: ${timeElapsed} minutes`);
    console.log(`Estimated Cost: $${estimatedCost}`);

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
  }

  stop(): void {
    this.running = false;
    console.log('Stopping question generation gracefully...');
  }
}

/**
 * Run the enhanced question generator with crowd-friendly settings
 */
async function runEnhancedGeneration() {
  const generator = new EnhancedQuestionGenerator();
  
  await generator.generateQuestions({
    totalQuestions: 4000, // Set for overnight generation with available credits
    // Use the enhanced distribution from the class
    trackStats: true,
    batchSize: 5  // Smaller batches for better monitoring
  });
}

if (require.main === module) {
  runEnhancedGeneration().catch(console.error);
}

export default EnhancedQuestionGenerator;