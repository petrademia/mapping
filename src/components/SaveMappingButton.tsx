import { serializeMapping, type MappingDocument } from "../lib/document";
import { download, slug } from "../lib/download";
import { saveOverDeckMapping } from "../lib/saveMappingClient";
import { Icon } from "./IconButton";

interface Props {
  doc: MappingDocument;
  onStatus: (message: string) => void;
}

/**
 * Saves the deck with its models. On the dev server this overwrites the file in public/decks/ that
 * holds a deck with the same name; a deck no file is named after is downloaded instead.
 */
export function SaveMappingButton({ doc, onStatus }: Props) {
  return (
    <button
      type="button"
      className="primary"
      onClick={() => {
        const text = serializeMapping(doc);
        void saveOverDeckMapping(text).then((result) => {
          if (result.saved) {
            onStatus(`Saved over ${result.path}`);
            return;
          }
          download(`${slug(doc.name)}.mapping.json`, text);
          onStatus(result.reason ? `Downloaded the mapping. ${result.reason}` : "Downloaded the mapping.");
        });
      }}
    >
      <Icon name="save" />
      Save mapping
    </button>
  );
}
