import { lstat } from "node:fs/promises";
import path from "node:path";

const reservedLocales = new Set(["search"]);

/** Canonicalizes one Unicode locale identifier. */
export function canonicalizeLocale(written: string): string {
  try {
    return new Intl.Locale(written).toString();
  } catch {
    throw new Error(
      `Locale "${written}" is not a valid BCP 47 language tag. Use a tag such as ja, en, or en-US.`,
    );
  }
}

/** Canonicalizes and validates the locale scopes in one site. */
export function canonicalizeLocales(
  writtenLocales: readonly string[],
): readonly string[] {
  const locales: string[] = [];
  for (const written of writtenLocales) {
    const locale = canonicalizeLocale(written);
    if (reservedLocales.has(locale)) {
      throw new Error(
        `Locale "${locale}" conflicts with Tsumugu's /search page.`,
      );
    }
    if (locales.includes(locale)) {
      throw new Error(`Locale "${locale}" is listed more than once.`);
    }
    locales.push(locale);
  }
  return locales;
}

/**
 * Validates direct locale directories before an adapter starts or writes.
 *
 * Core owns this rule so development and static-build adapters cannot disagree
 * about canonical paths or symlinks.
 */
export async function validateLocaleDirectories(
  root: string,
  writtenLocales: readonly string[],
): Promise<readonly string[]> {
  const locales = canonicalizeLocales(writtenLocales);
  for (const locale of locales) {
    const directory = path.join(root, locale);
    let exists = false;
    try {
      exists = (await lstat(directory)).isDirectory();
    } catch {
      // Missing and unreadable paths need the same action from the caller.
    }
    if (!exists) {
      throw new Error(
        `Locale "${locale}" directory ${directory} was not found.`,
      );
    }
  }
  return locales;
}
