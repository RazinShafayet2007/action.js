import type { CliIo } from "./types.js";

export const defaultCliIo: CliIo = {
  stdout: {
    write(message) {
      process.stdout.write(message);
    },
  },
  stderr: {
    write(message) {
      process.stderr.write(message);
    },
  },
};

export function writeLine(io: CliIo, message: string): void {
  io.stdout.write(`${message}\n`);
}

export function writeErrorLine(io: CliIo, message: string): void {
  io.stderr.write(`${message}\n`);
}
