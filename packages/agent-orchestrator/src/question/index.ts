/** The face of `question/`: a question as data, its answers and their words, and the terminal's numbering of them, by name. */
export {
  answerRefusal,
  answerText,
  approvedAnswerText,
  askedQuestions,
  closeoutRefusals,
  expandShapes,
  questionsOf,
  SHAPE_KEY,
} from './question.ts';
export type { Answer, Asked, Question } from './question.ts';
export { answersOr, numberedAnswers, numberedQuestions, questionLines } from './numbered.ts';
