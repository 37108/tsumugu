import {
  canonicalizeLocale,
  canonicalizeLocales,
  validateLocaleDirectories as validateCoreLocaleDirectories,
} from "tsumugu-core";

type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

function canonicalLocale(value: string): Parsed<string> {
  try {
    return { ok: true, value: canonicalizeLocale(value) };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export function parseLocales(
  value: string | undefined,
): Parsed<readonly string[]> {
  if (value === undefined) {
    return { ok: false, message: "--locales needs a value." };
  }

  const writtenLocales: string[] = [];
  for (const written of value.split(",")) {
    const trimmed = written.trim();
    if (trimmed === "") {
      return {
        ok: false,
        message:
          "--locales needs a comma-separated list without empty entries.",
      };
    }

    writtenLocales.push(trimmed);
  }

  try {
    return { ok: true, value: canonicalizeLocales(writtenLocales) };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export function parseLang(value: string | undefined): Parsed<string> {
  if (value === undefined) {
    return { ok: false, message: "--lang needs a value." };
  }
  return canonicalLocale(value.trim());
}

export class LocaleDirectoryError extends Error {}

export async function validateLocaleDirectories(
  root: string,
  locales: readonly string[] | undefined,
): Promise<readonly string[] | undefined> {
  if (locales === undefined) {
    return undefined;
  }
  try {
    return await validateCoreLocaleDirectories(root, locales);
  } catch (cause) {
    throw new LocaleDirectoryError(
      cause instanceof Error ? cause.message : String(cause),
    );
  }
}
