import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

/** Three addresses only: "/" (landing), "/login" and "/app". Real URLs, so links can be shared and bookmarked. */
export const navigate = (to: string) => {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
};

export const usePath = (): string => {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return path;
};

/** A normal link that changes page without reloading; anchors (#how) behave as usual. */
export const Link = ({ href = "/", onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a
    href={href}
    onClick={(event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || href.startsWith("#") || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      navigate(href);
    }}
    {...props}
  />
);
