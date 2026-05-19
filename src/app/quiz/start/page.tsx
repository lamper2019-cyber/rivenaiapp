import { QuizFlow } from "./quiz-flow";

export const metadata = {
  title: "Start the assessment — RIVEN",
  description: "Answer 15 questions and find out what's standing between you and the body you want.",
};

export default function QuizStartPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  return <QuizFlow initialError={searchParams?.error} />;
}
