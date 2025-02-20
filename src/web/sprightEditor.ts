import { Config } from "./sprightConfig";

function appendElement(parent: HTMLElement, type: string, className: string) {
  const div = document.createElement(type);
  div.className = className;
  parent.appendChild(div);
  return div;
}

type Input = {
  filename: string;
  sourceIndices: number[];
};

type Source = {
  index: number;
  filename: string;
  path: string;
  width: number;
  height: number;
  spriteIndices: number[];
  uri: string;
};

type Point = {
  x: number;
  y: number;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Sprite = {
  id: string;
  index: number;
  inputSpriteIndex: number;
  pivot: Point;
  rect: Rect;
  trimmedRect: Rect;
  rotated: boolean;
  sourceIndex: number;
  sourceRect: Rect;
  trimmedSourceRect: Rect;
  sliceIndex: number;
  sliceSpriteIndex: number;
  data: object;
  tags: object;
  vertices: Point[];
};

type Description = {
  inputs: Input[];
  sources: Source[];
  sprites: Sprite[];
};

type State = {
  config: string;
  description: Description;
};

export class SprightEditor {
  private content: HTMLElement;
  private updateState: any;
  private postMessage: any;
  private config: Config;
  private description: Description;
  private zoom = 2;
  private applyZoom?: () => void;

  constructor(content: HTMLElement, updateState: any, postMessage: any) {
    this.content = content;
    this.updateState = updateState;
    this.postMessage = postMessage;
    this.config = new Config("");
    this.description = {} as Description;
  }

  onZoom(direction: number) {
    const levels = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
    let n = levels.indexOf(this.zoom);
    if (n == -1) n = 2;
    if (n > 0 && direction == -1) --n;
    if (n < levels.length - 1 && direction == 1) ++n;
    this.zoom = levels[n];
    if (this.applyZoom)
      this.applyZoom();
  }

  onMessage(message: any) {
    switch (message.type) {
      case "setConfig":
        this.setConfig(message.config, message.description);
        return;
    }
  }

  setConfig(config: string, description: any) {
    const state: State = {
      config,
      description,
    };
    this.updateState(state);
    this.restoreState(state);
  }

  private showError(message: string) {
    this.content.innerHTML = `<div class='error'>${message}</div>`;
  }

  restoreState(state: State) {
    try {
      this.config = new Config(state.config);
      this.description = state.description;
    } catch {
      return this.showError("Parsing configuration failed");
    }
    this.rebuildView();
  }

  private rebuildView() {
    const inputsDiv = document.createElement("div");
    inputsDiv.className = "inputs";
    this.applyZoom = () => { inputsDiv.style.setProperty("--zoom", this.zoom.toString()); };
    this.applyZoom();

    for (const input of this.description.inputs) {
      const inputDiv = appendElement(inputsDiv, "div", "input");

      const textDiv = appendElement(inputDiv, "div", "text");
      textDiv.innerText = input.filename;

      const sourcesDiv = appendElement(inputDiv, "div", "sources");
      for (const index of input.sourceIndices) {
        const source = this.description.sources[index];
        const sourceDiv = appendElement(sourcesDiv, "div", "source");

        if (source.filename !== input.filename) {
          const textDiv = appendElement(sourceDiv, "div", "text");
          textDiv.innerText = source.filename;
        }
        const spritesFrameDiv = appendElement(sourceDiv, "div", "frame");
        const spritesDiv = appendElement(spritesFrameDiv, "div", "sprites");
        spritesDiv.style.setProperty("--filename", `url('${source.uri}'`);
        spritesDiv.style.setProperty("--width", source.width + "px");
        spritesDiv.style.setProperty("--height", source.height + "px");

        for (const index of source.spriteIndices) {
          const sprite = this.description.sprites[index];
          const spriteDiv = appendElement(spritesDiv, "div", "sprite");
          const rect = sprite.trimmedSourceRect;
          spriteDiv.style.setProperty("--rect_x", rect.x + "px");
          spriteDiv.style.setProperty("--rect_y", rect.y + "px");
          spriteDiv.style.setProperty("--rect_w", rect.w + "px");
          spriteDiv.style.setProperty("--rect_h", rect.h + "px");

          const pivotDiv = appendElement(spritesDiv, "div", "pivot");
          pivotDiv.style.setProperty("--x", (rect.x + sprite.pivot.x) + "px");
          pivotDiv.style.setProperty("--y", (rect.y + sprite.pivot.y) + "px");

          const textDiv = appendElement(spriteDiv, "div", "text");
          textDiv.innerText = sprite.id;
        }
      }

      /*
      const deleteButton = appendElement(inputDiv, "button", "delete-button");
      deleteButton.addEventListener("click", () => {
        //this.postMessage({
        //  type: "updateConfig",
        //  text: "# " + this.config.toString(),
        //});
        this.postMessage({
          type: "execSpright",
          text: this.config.toString(),
        });
      });
*/
    }

    this.content.innerHTML = "";
    this.content.appendChild(inputsDiv);
  }
}
