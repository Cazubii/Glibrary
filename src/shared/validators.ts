export function isSafeDirectoryName(name: string): boolean {
  return (
    name !== '.' &&
    name !== '..' &&
    !/[<>:"|?*\\/\0-\x1f]/.test(name) &&
    !/[. ]$/.test(name) &&
    !/^(con|prn|aux|nul|conin\$|conout\$|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)
  );
}
