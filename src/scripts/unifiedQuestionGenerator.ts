import { config } from 'dotenv';
import QuestionService from '@/services/QuestionService';
import { trivia_category, trivia_difficulty, trivia_question_status } from '@prisma/client';

config();

class UnifiedQuestionGenerator {
  private questionService: QuestionService;
  private running: boolean = false;
  
  private readonly categoryDistribution: Record<trivia_category, number> = {
    technology: 0.12,
    science: 0.10,
    literature: 0.10,
    pop_culture: 0.08,
    history: 0.10,
    geography: 0.08,
    sports: 0.08,
    gaming: 0.10,
    internet: 0.08,
    movies: 0.08,
    music: 0.08
  }

  constructor() {
    this.questionService = QuestionService.getInstance();
  }

  async generateQuestions(config: {
    totalQuestions: number;
    categoriesDistribution: Record<trivia_category, number>;
    difficultyDistribution: Record<trivia_difficulty, number>;
    batchSize?: number;
  }): Promise<void> {
    this.running = true;
    const batchSize = config.batchSize || 10;
    let totalGenerated = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalDuplicates = 0;
    const startTime = Date.now();
    const uniqueQuestions = new Set<string>();

    console.log('Starting unified question generation...');
    console.log(`Target: ${config.totalQuestions} questions`);
    console.log('Category Distribution:', config.categoriesDistribution);
    console.log('Difficulty Distribution:', config.difficultyDistribution);
    
    while (this.running && totalGenerated < config.totalQuestions) {
      const currentBatchSize = Math.min(batchSize, config.totalQuestions - totalGenerated);
      console.log(`\nStarting batch ${Math.floor(totalGenerated / batchSize) + 1}`);
      
      try {
        const batchResults = await this.generateBatch({
          batchSize: currentBatchSize,
          categoriesDistribution: config.categoriesDistribution,
          difficultyDistribution: config.difficultyDistribution,
          uniqueQuestions
        });

        // Update statistics
        totalGenerated += currentBatchSize;
        totalSuccess += batchResults.successCount;
        totalFailed += batchResults.failureCount;
        totalDuplicates += batchResults.duplicateCount;

        // Print batch summary
        console.log('\nBatch Summary:');
        console.log(`Generated: ${batchResults.successCount}/${currentBatchSize}`);
        console.log(`Failed: ${batchResults.failureCount}`);
        console.log(`Duplicates prevented: ${batchResults.duplicateCount}`);
        
        // Print category distribution for this batch
        console.log('\nCategory Distribution:');
        Object.entries(batchResults.categoryCount).forEach(([category, count]) => {
          console.log(`${category}: ${count}`);
        });

        // Cost estimation (assuming $0.04 per question based on previous runs)
        const estimatedCost = (totalSuccess * 0.04).toFixed(2);
        const timeElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        
        console.log('\nProgress Summary:');
        console.log(`Total Success: ${totalSuccess}/${config.totalQuestions}`);
        console.log(`Estimated Cost: $${estimatedCost}`);
        console.log(`Time Elapsed: ${timeElapsed} minutes`);
        
        // Add delay between batches to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('Batch generation error:', error);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    await this.printFinalSummary(totalSuccess, totalFailed, totalDuplicates, startTime);
  }

  private async generateBatch(config: {
    batchSize: number;
    categoriesDistribution: Record<trivia_category, number>;
    difficultyDistribution: Record<trivia_difficulty, number>;
    uniqueQuestions: Set<string>;
  }): Promise<{
    successCount: number;
    failureCount: number;
    duplicateCount: number;
    categoryCount: Record<trivia_category, number>;
  }> {
    let successCount = 0;
    let failureCount = 0;
    let duplicateCount = 0;
    const categoryCount: Record<trivia_category, number> = {} as Record<trivia_category, number>;

    for (let i = 0; i < config.batchSize; i++) {
      const category = this.selectBasedOnDistribution(config.categoriesDistribution);
      const difficulty = this.selectBasedOnDistribution(config.difficultyDistribution) as trivia_difficulty;

      try {
        const result = await this.questionService.generateAndValidateQuestion({
          category,
          difficulty,
          context: this.getCategoryContext(category)
        });

        if (!result.success || !result.data) {
          console.error(`Failed to generate question:`, result.error);
          failureCount++;
          continue;
        }

        const question = result.data;
        
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
        
        // Update category count
        categoryCount[category] = (categoryCount[category] || 0) + 1;
        
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

        // Increased delay between questions to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error(`Error generating question:`, error);
        failureCount++;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    return { successCount, failureCount, duplicateCount, categoryCount };
  }

  private async printFinalSummary(
    totalSuccess: number,
    totalFailed: number,
    totalDuplicates: number,
    startTime: number
  ): Promise<void> {
    const timeElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const estimatedCost = (totalSuccess * 0.04).toFixed(2);

    console.log('\n=== Final Generation Summary ===');
    console.log(`Total Questions Generated: ${totalSuccess}`);
    console.log(`Failed Attempts: ${totalFailed}`);
    console.log(`Duplicates Prevented: ${totalDuplicates}`);
    console.log(`Time Elapsed: ${timeElapsed} minutes`);
    console.log(`Estimated Cost: $${estimatedCost}`);

    // Get category distribution from generated questions
    const result = await this.questionService.getQuestionsByCategory('technology');
    if (result.success && result.data) {
      console.log('\nCategory Distribution:');
      const categories: trivia_category[] = [
        'technology', 'science', 'literature', 'pop_culture', 'history', 'geography', 'sports', 'gaming', 'internet', 'movies', 'music'
      ];
      for (const category of categories) {
        const categoryQuestions = await this.questionService.getQuestionsByCategory(category);
        if (categoryQuestions.success && categoryQuestions.data) {
          console.log(`${category}: ${categoryQuestions.data.length}`);
        }
      }

      console.log('\nDifficulty Distribution:');
      const difficultyCount = {
        [trivia_difficulty.easy]: 0,
        [trivia_difficulty.medium]: 0,
        [trivia_difficulty.hard]: 0
      };

      result.data.forEach(q => {
        if (q.difficulty in difficultyCount) {
          difficultyCount[q.difficulty]++;
        }
      });

      Object.entries(difficultyCount).forEach(([difficulty, count]) => {
        console.log(`${difficulty}: ${count}`);
      });
    }
  }

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

  private getCategoryContext(category: trivia_category): string {
    switch (category) {
      case 'technology':
        return `Focus areas:
- Tech fails and unexpected consequences
- Quirky startup stories and founder anecdotes
- AI doing surprising things
- Tech that seemed futuristic but flopped
- Hidden features in everyday devices
- Easter eggs in popular software
- Strange patents and weird innovations
- Behind-the-scenes tech industry drama`;

      case 'science':
        return `Focus areas:
- Weird scientific discoveries
- Animals with superpowers
- Space exploration surprises
- Failed experiments that led to breakthroughs
- Scientists who were ahead of their time
- Nature's oddities and mysteries
- Accidental discoveries
- Mind-bending quantum facts`;

      case 'pop_culture':
        return `Focus areas:
- Viral moments and their aftermath
- Celebrity tech ventures
- Social media milestones
- Influencer impact stories
- Unexpected brand collaborations
- Platform wars and drama
- Reality TV tech moments
- Cultural phenomena origins`;

      case 'history':
        return `Focus areas:
- Tech predictions that were hilariously wrong
- Lost technologies ahead of their time
- Historical figures who would've loved social media
- Ancient solutions to modern problems
- Weird laws that still exist
- Time travelers' paradoxes
- Historical coincidences
- Inventions with unexpected origins`;

      case 'geography':
        return `Focus areas:
- Hidden tech hubs in unexpected places
- Internet cables in strange locations
- Secret server facilities
- Cities built for tech
- Digital nomad destinations
- Weird maps and navigation fails
- Geographical anomalies
- Places that changed the internet`;

      case 'sports':
        return `Focus areas:
- Esports drama and legendary matches
- Tech changing traditional sports
- Athletes in gaming
- Sports statistics oddities
- Training tech breakthroughs
- Fantasy sports stories
- Unusual sports tech
- Record-breaking moments`;

      case 'gaming':
        return `Focus areas:
- Easter eggs and hidden content
- Speedrunning records and strats
- Dev team stories and drama
- Glitches that became features
- Canceled games that looked amazing
- Modding community achievements
- Gaming world records
- Industry secrets and leaks`;

      case 'internet':
        return `Focus areas:
- Early internet culture
- Forum drama that made history
- Browser war stories
- Forgotten platforms
- Web design trends that aged poorly
- Domain name gold rush stories
- Internet mysteries
- Protocol development drama`;

      case 'movies':
        return `Focus areas:
- CGI breakthrough moments
- Movie tech fails
- Streaming wars drama
- Hidden movie tech references
- Special effects secrets
- Digital vs practical effects debates
- Virtual production innovations
- AI in filmmaking stories`;

      case 'music':
        return `Focus areas:
- Music streaming records
- Auto-tune origin stories
- Digital music format wars
- Virtual concert innovations
- AI-generated music surprises
- Sampling controversy stories
- Music tech startups
- Digital instrument breakthroughs`;

      case 'literature':
        return `Focus areas:
- Notable authors and their unique writing styles
- Literary movements and their impact
- Award-winning books and their significance
- Influential works that changed genres
- Writing techniques and innovations
- Publishing industry milestones
- Literary adaptations and their success
- Books that shaped modern thinking
- International literary influences
- Genre-defining works`;

      default:
        return '';
    }
  }

  stop(): void {
    this.running = false;
  }
}

// Example usage for testing with 2000 questions
async function runUnifiedGeneration() {
  const generator = new UnifiedQuestionGenerator();
  
  await generator.generateQuestions({
    totalQuestions: 2000,
    categoriesDistribution: {
      technology: 0.12,    // Core tech concepts
      science: 0.10,       // Scientific discoveries
      literature: 0.10,    // Books and writing
      pop_culture: 0.08,   // Current trends
      history: 0.10,       // Historical events
      geography: 0.08,     // Global knowledge
      sports: 0.08,        // Sports and esports
      gaming: 0.10,        // Video games
      internet: 0.08,      // Web platforms
      movies: 0.08,        // Cinema
      music: 0.08         // Music and tech
    },
    difficultyDistribution: {
      [trivia_difficulty.easy]: 0.4,
      [trivia_difficulty.medium]: 0.4,
      [trivia_difficulty.hard]: 0.2
    },
    batchSize: 5  // Smaller batches for better monitoring
  });
}

if (require.main === module) {
  runUnifiedGeneration().catch(console.error);
}