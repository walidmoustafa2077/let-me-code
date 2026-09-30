import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

export function createAsk() {
  return async function ask(conflicts) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      const answer = await rl.question(
        `\nExisting files found (${conflicts.join(", ")}).\n` +
          "  [m]erge   keep yours, add the factory\n" +
          "  [o]verwrite   back up and replace\n" +
          "  [a]bort\n" +
          "Choose [m/o/a]: "
      );
      const choice = answer.trim().toLowerCase();
      if (choice.startsWith("o")) return "overwrite";
      if (choice.startsWith("a")) return "abort";
      return "merge";
    } finally {
      rl.close();
    }
  };
}
