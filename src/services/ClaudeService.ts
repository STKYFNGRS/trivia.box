import { Question, QuestionGenerationParams, ValidationResult } from '../types'
import type { ValidationFeedback } from '../types/api'

class ClaudeService {
  private static instance: ClaudeService | null = null
  private apiKey: string

  private constructor() {
    this.apiKey = process.env.CLAUDE_API_KEY || ''
    if (!this.apiKey) throw new Error('CLAUDE_API_KEY not found')
  }

  static getInstance(): ClaudeService {
    if (!this.instance) {
      this.instance = new ClaudeService()
    }
    return this.instance
  }

  async generateQuestion(params: QuestionGenerationParams): Promise<Question> {
    const prompt = `Generate a ${params.difficulty} trivia question about ${params.category}.
    You are a witty trivia host who knows your topics deeply but keeps questions punchy and interesting.

    Category Context:
    ${params.context || this.getDefaultContextForCategory(params.category)}

    Question Requirements:
    - Questions must be 1-2 sentences maximum
    - Answers must be 1-5 words maximum
    - Focus on surprising facts and "didn't know that!" moments
    - Easy: Test recognition of interesting basics (90% of players should know)
    - Medium: Test knowledge of cool relationships or impacts (50% should know)
    - Hard: Test specialist knowledge of fascinating details (only 20% should know)
    - Ensure no similar questions exist in your previous outputs
    - Favor specific facts over general knowledge
    - Include quantifiable elements when possible (dates, numbers, measurements)
    - Make wrong answers plausible but clearly incorrect
    - Ensure answers are distinct from each other
    - Keep cultural references globally accessible
    - Avoid subjective or debatable answers
    - Focus on verified historical facts

    Format response as JSON:
    {
      "content": "question text (1-2 sentences)",
      "correct_answer": "brief answer (1-5 words)",
      "incorrect_answers": ["wrong1", "wrong2", "wrong3"],
      "difficulty_justification": "Brief explanation of why this matches the requested difficulty",
      "fact_source": "Brief mention of where this fact is documented"
    }`

    const response = await this.callClaude(prompt)
    const cleanResponse = this.cleanJsonResponse(response)
    const generated = JSON.parse(cleanResponse)
    
    // Log additional context but don't store it
    if (generated.difficulty_justification) {
      console.log('\nDifficulty Justification:', generated.difficulty_justification)
    }
    if (generated.fact_source) {
      console.log('Fact Source:', generated.fact_source)
    }
    
    // Remove metadata before returning
    delete generated.difficulty_justification
    delete generated.fact_source
    
    return generated
  }

  async validateQuestion(question: Question): Promise<ValidationResult> {
    const prompt = `You are a strict trivia question validator. Validate this trivia question with extreme attention to detail:
    ${JSON.stringify(question, null, 2)}

    Validation requirements:
    1. Structural Requirements:
       - Question must be 1-2 sentences maximum
       - Correct answer must be 1-5 words
       - Incorrect answers must be similarly brief
       - All answers must be distinct
       
    2. Content Quality:
       - Question demonstrates expertise in the topic
       - Avoids surface-level or obvious information
       - Tests specific knowledge, not general awareness
       - Matches specified difficulty level
       - Uses precise language without ambiguity
       
    3. Answer Quality:
       - All incorrect answers are plausible but clearly wrong
       - Answers don't give away the correct response
       - No overlap or ambiguity between answers
       - Answers are consistent in style and length
       
    4. Factual Accuracy:
       - Information is verifiable from reliable sources
       - No ambiguous or debatable facts
       - Historical dates and numbers are precise
       - Technical terms are used correctly

    You must be 100% certain of accuracy, clarity, and appropriate difficulty to approve.
    Reject if any requirement is not fully met.

    Format response as JSON:
    {
      "status": "approved" | "rejected",
      "feedback": [
        {
          "type": "error" | "warning" | "suggestion",
          "message": "detailed feedback message"
        }
      ],
      "confidence_score": 0-100,
      "difficulty_rating": {
        "expected": "${question.difficulty}",
        "actual": "easy" | "medium" | "hard",
        "matches": true | false
      }
    }`

    try {
      const response = await this.callClaude(prompt)
      const cleanResponse = this.cleanJsonResponse(response)
      const validationResult = JSON.parse(cleanResponse)
      
      // Strict validation criteria
      if (validationResult.confidence_score < 95 || 
          validationResult.feedback.some((f: ValidationFeedback) => f.type === 'error') ||
          !validationResult.difficulty_rating.matches) {
        validationResult.status = 'rejected'
      }
      
      // Remove metadata before returning
      delete validationResult.confidence_score
      delete validationResult.difficulty_rating
      
      return validationResult
    } catch (error) {
      console.error('Validation error:', error)
      return {
        status: 'rejected',
        feedback: [{
          type: 'error',
          message: 'Validation process failed'
        }]
      }
    }
  }

  private async callClaude(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
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
    })

    if (!response.ok) throw new Error('Claude API call failed')
    const data = await response.json()
    return data.content[0].text
  }

  private cleanJsonResponse(response: string): string {
    const jsonMatch = response.match(/```(?:json)?\n([\s\S]*?)```/)
    if (jsonMatch) {
      return jsonMatch[1].trim()
    }
    return response.trim()
  }

  private getDefaultContextForCategory(category: string): string {
    // Default contexts are used when no specific context is provided
    const contexts: Record<string, string> = {
      technology: 'Focus on transformative tech innovations, key inventions, industry milestones, and surprising tech facts. Include both historical developments and recent breakthroughs.',
      science: 'Cover breakthrough discoveries, unexpected scientific findings, and fascinating research outcomes. Include both fundamental principles and cutting-edge developments.',
      literature: 'Focus on influential works, author innovations, genre-defining moments, and publishing milestones. Include both classical and contemporary literature.',
      pop_culture: 'Highlight defining moments, unexpected connections, and cultural phenomena. Focus on impactful trends and surprising industry facts.',
      history: 'Emphasize lesser-known historical events, surprising connections, and unexpected outcomes. Include both major events and fascinating details.',
      geography: 'Focus on unique geographical features, unexpected relationships between locations, and interesting spatial phenomena.',
      sports: 'Cover significant achievements, unusual rules, statistical anomalies, and fascinating sports history. Include both traditional and emerging sports.',
      gaming: 'Highlight game development stories, industry innovations, unexpected successes, and fascinating gaming history.',
      internet: 'Focus on internet history, protocol development, platform evolution, and web culture milestones.',
      movies: 'Cover production secrets, industry innovations, box office surprises, and fascinating cinema history.',
      music: 'Emphasize music innovation, industry milestones, surprising collaborations, and technical achievements.'
    }
    return contexts[category] || 'Focus on verified facts and surprising connections within this topic area.'
  }
}

export default ClaudeService