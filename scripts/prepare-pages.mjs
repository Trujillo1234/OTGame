import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("pages-dist");
const routes = ["penn-run", "denver-fight-club", "otgame"];

await Promise.all(
  routes.map(async (route) => {
    const directory = resolve(output, route);
    await mkdir(directory, { recursive: true });
    await copyFile(resolve(output, "index.html"), resolve(directory, "index.html"));
  }),
);

await writeFile(resolve(output, ".nojekyll"), "");
