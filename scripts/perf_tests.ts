import { performance } from "perf_hooks";
import { getCfEmbedding } from "../src/utils/embeddingsCache/getCachedOrFetchEmbeddings";
import { getAdaEmbedding } from "../src/openai/utils/embeddingsHelper";

async function benchmarkEmbeddings(textSamples: string[]): Promise<void> {
  const cfTimes: number[] = [];
  const adaTimes: number[] = [];

  for (const text of textSamples) {
    // Benchmarking Cloudflare Embeddings
    const cfStart = performance.now();
    await getCfEmbedding(text);
    const cfEnd = performance.now();
    cfTimes.push(cfEnd - cfStart);

    // Benchmarking OpenAI Embeddings
    const adaStart = performance.now();
    await getAdaEmbedding([text]);
    const adaEnd = performance.now();
    adaTimes.push(adaEnd - adaStart);
  }

  const metrics = (times: number[]) => ({
    avg: times.reduce((acc, val) => acc + val, 0) / times.length,
    median: times.sort()[Math.floor(times.length / 2)],
    min: Math.min(...times),
    max: Math.max(...times)
  });

  const cfMetrics = metrics(cfTimes);
  const adaMetrics = metrics(adaTimes);

  console.log("Cloudflare Embeddings:", cfMetrics);
  console.log("OpenAI Embeddings:", adaMetrics);

  // Visualization in command line with simple bar charts
  console.log("\nPerformance (milliseconds):");
  console.log("Service       | Avg   | Median | Min   | Max   ");
  console.log("--------------|-------|--------|-------|-------");
  console.log(
    `Cloudflare    | ${cfMetrics.avg.toFixed(2)} | ${cfMetrics.median.toFixed(2)} | ${cfMetrics.min.toFixed(2)} | ${cfMetrics.max.toFixed(2)}`
  );
  console.log(
    `OpenAI        | ${adaMetrics.avg.toFixed(2)} | ${adaMetrics.median.toFixed(2)} | ${adaMetrics.min.toFixed(2)} | ${adaMetrics.max.toFixed(2)}`
  );
}

// Example execution with 20 text samples
const textSamples = [
    "Machine learning is revolutionizing industries.",
    "Blockchain technology could reshape financial systems.",
    "Virtual reality creates immersive experiences.",
    "The impact of climate change is evident in weather patterns.",
    "Artificial intelligence raises ethical dilemmas.",
    "Quantum computing promises to solve complex problems.",
    "Biotechnology advances lead to breakthroughs in health.",
    "Space exploration pushes the boundaries of human achievement.",
    "Sustainable energy solutions are crucial for a green future.",
    "Augmented reality blends digital and physical worlds.",
    "Nanotechnology has potential in medicine and materials.",
    "Autonomous vehicles could reduce road accidents.",
    "5G technology accelerates internet speeds.",
    "E-commerce has transformed the way we shop.",
    "Remote work became prominent due to global pandemics.",
    "Robotics is changing manufacturing industries.",
    "The metaverse is a virtual shared space created by converging physical and digital reality.",
    "Gene editing could eradicate certain genetic diseases.",
    "Cybersecurity is paramount in the digital age.",
    "Drones are being used for delivery and surveillance."
  ];
  
benchmarkEmbeddings(textSamples).catch((error) => console.error("Benchmarking failed:", error));
