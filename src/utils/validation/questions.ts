import type { ValidationFeedback } from '../../types/api';
import { trivia_difficulty, trivia_category, trivia_question_status } from '@prisma/client';

export function validateQuestionContent(content: string): ValidationFeedback[] {
  const feedback: ValidationFeedback[] = [];

  if (content.length < 10 || content.length > 300) {
    feedback.push({
      type: 'error',
      field: 'content',
      message: 'Question length must be between 10 and 300 characters'
    });
  }

  if (!content.includes('?')) {
    feedback.push({
      type: 'error',
      field: 'content',
      message: 'Question must end with a question mark'
    });
  }

  return feedback;
}

export function validateAnswers(
  correct: string,
  incorrect: string[]
): ValidationFeedback[] {
  const feedback: ValidationFeedback[] = [];

  // Check for duplicate answers
  const allAnswers = [correct, ...incorrect];
  const uniqueAnswers = new Set(allAnswers.map(a => a.toLowerCase().trim()));
  if (uniqueAnswers.size !== allAnswers.length) {
    feedback.push({
      type: 'error',
      field: 'incorrect_answers',
      message: 'Duplicate answers found'
    });
  }

  // Check answer lengths
  if (incorrect.some(a => a.length < 1)) {
    feedback.push({
      type: 'error',
      field: 'incorrect_answers',
      message: 'All answers must have content'
    });
  }

  // Check answer word count
  const maxWords = 5;
  const wordCount = (str: string) => str.trim().split(/\s+/).length;
  
  if (wordCount(correct) > maxWords) {
    feedback.push({
      type: 'error',
      field: 'correct_answer',
      message: `Correct answer must be ${maxWords} words or less`
    });
  }

  incorrect.forEach((answer, index) => {
    if (wordCount(answer) > maxWords) {
      feedback.push({
        type: 'error',
        field: 'incorrect_answers',
        message: `Answer option ${index + 1} must be ${maxWords} words or less`
      });
    }
  });

  return feedback;
}

export function validateGenerationParams(
  difficulty: trivia_difficulty,
  category: trivia_category
): ValidationFeedback[] {
  const feedback: ValidationFeedback[] = [];

  if (!Object.values(trivia_difficulty).includes(difficulty)) {
    feedback.push({
      type: 'error',
      field: 'difficulty',
      message: 'Invalid difficulty level'
    });
  }

  if (!Object.values(trivia_category).includes(category)) {
    feedback.push({
      type: 'error',
      field: 'category',
      message: 'Invalid category'
    });
  }

  return feedback;
}

export function determineFinalStatus(
  feedback: ValidationFeedback[]
): trivia_question_status {
  if (feedback.some(f => f.type === 'error')) {
    return trivia_question_status.rejected;
  }
  if (feedback.length > 0) {
    return trivia_question_status.reviewing;
  }
  return trivia_question_status.approved;
}