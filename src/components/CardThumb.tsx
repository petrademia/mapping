import { cardImageUrl, useCardImageIds } from "../lib/cardImages";

interface Props {
  cardId: number;
  name: string;
}

/**
 * Fixed-size card thumbnail. Reserves the same box whether or not a local
 * image exists so rows never shift; the placeholder is decorative.
 */
export function CardThumb({ cardId, name }: Props) {
  const available = useCardImageIds().has(cardId);
  return (
    <span className={available ? "card-thumb" : "card-thumb empty"}>
      {available ? (
        <img
          src={cardImageUrl(cardId)}
          alt={name}
          width={40}
          height={58}
          loading="lazy"
          decoding="async"
        />
      ) : null}
    </span>
  );
}
