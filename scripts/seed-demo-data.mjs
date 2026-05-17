import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), ".data");
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(
  path.join(dataDir, "restaurant-cache.json"),
  JSON.stringify(
    {
      cacheKey: "seed",
      restaurants: [],
      updatedAt: new Date().toISOString(),
      note: "The app seeds useful demo restaurants from src/lib/demo-data.ts when no matching cache is found.",
    },
    null,
    2,
  ),
);

console.log("Seeded .data/restaurant-cache.json");
