import { useMemo, useState } from "react";

type LeagueLogoProps = {
  id: number;
  name: string;
  src?: string | null;
  className: string;
};

export function LeagueLogo({ id, name, src, className }: LeagueLogoProps) {
  const sources = useMemo(() => {
    const values = [
      src,
      `https://images.fotmob.com/image_resources/logo/leaguelogo/${id}.png`,
      `https://images.fotmob.com/image_resources/logo/leaguelogo/${id}_small.png`
    ].filter((value): value is string => !!value);
    return [...new Set(values)];
  }, [id, src]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const initial = name.trim().slice(0, 1).toLocaleUpperCase("tr-TR") || "?";

  return (
    <span className={className}>
      <span aria-hidden="true">{initial}</span>
      {sources[sourceIndex] ? (
        <img
          key={sources[sourceIndex]}
          src={sources[sourceIndex]}
          alt={`${name} logosu`}
          loading="lazy"
          onError={() => setSourceIndex(index => Math.min(index + 1, sources.length))}
        />
      ) : null}
    </span>
  );
}
