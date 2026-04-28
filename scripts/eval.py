from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
import requests, json, os

# Your golden dataset — 10 questions you know the answers to
GOLDEN_SET = [
    {
        "question": "What is the onboarding process for new engineers?",
        "ground_truth": "New engineers go through a 2-week onboarding...",  # fill this in
    },
    # add 9 more real questions from your knowledge base
]

API_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")

def query_rag(question: str) -> dict:
    res = requests.post(
        f"{API_URL}/api/chat",
        json={"query": question, "history": []},
        stream=True,
    )
    
    citations = json.loads(res.headers.get("X-Citations", "[]"))
    
    # Collect streamed answer
    answer = ""
    for chunk in res.iter_lines():
        line = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
        if line.startswith("0:"):
            try:
                answer += json.loads(line[2:])
            except:
                pass

    return {
        "answer": answer,
        "contexts": [c["title"] for c in citations],
    }

# Build evaluation dataset
rows = []
for item in GOLDEN_SET:
    print(f"Querying: {item['question'][:50]}...")
    result = query_rag(item["question"])
    rows.append({
        "question": item["question"],
        "answer": result["answer"],
        "contexts": result["contexts"],
        "ground_truth": item["ground_truth"],
    })

dataset = Dataset.from_list(rows)

# Run RAGAS
results = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)

print("\n── RAGAS Evaluation Results ──")
print(results)