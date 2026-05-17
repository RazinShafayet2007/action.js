export function matchPath(pathPattern: string, pathname: string): Record<string, string> | null {
  const patternSegments = normalizePath(pathPattern).split("/").filter(Boolean);
  const pathnameSegments = normalizePath(pathname).split("/").filter(Boolean);

  if (patternSegments.length !== pathnameSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (const [index, patternSegment] of patternSegments.entries()) {
    const pathnameSegment = pathnameSegments[index];

    if (pathnameSegment === undefined) {
      return null;
    }

    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathnameSegment);
      continue;
    }

    if (patternSegment !== pathnameSegment) {
      return null;
    }
  }

  return params;
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path || "/";
}
