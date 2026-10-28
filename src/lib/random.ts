import { randomInt } from "node:crypto";

const ADJECTIVES = [
  "Masked", "Hidden", "Silent", "Shady", "Hooded", "Phantom", "Secret", "Sneaky",
  "Veiled", "Cloaked", "Faceless", "Nameless", "Shadow", "Mystery", "Incognito", "Covert",
];

const ANIMALS = [
  "Otter", "Raccoon", "Fox", "Owl", "Possum", "Crow", "Moth", "Ferret",
  "Lynx", "Gecko", "Badger", "Bat", "Weasel", "Panda", "Koala", "Squid",
];

export const AVATAR_COLORS = [
  "#d082ff", "#ff6b9d", "#ffb84d", "#4dd4ac", "#4da6ff", "#ff7a59", "#9b8cff", "#5ce1e6",
];

function pick<T>(list: readonly T[]): T {
  return list[randomInt(list.length)]!;
}

/** A throwaway pseudonym like "Masked Otter #0421", unique-ish per post. */
export function randomAlias(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)} #${String(randomInt(10000)).padStart(4, "0")}`;
}

export function randomAvatarColor(): string {
  return pick(AVATAR_COLORS);
}
