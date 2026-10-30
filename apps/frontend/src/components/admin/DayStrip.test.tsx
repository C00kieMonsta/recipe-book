import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DayStrip from "./DayStrip";

describe("DayStrip mouse drop targets", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("prevents navigation dragover and reports the target day on drop", () => {
    const onDragOverDay = jest.fn();
    const onDropDay = jest.fn();
    act(() => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <DayStrip
            dates={["2026-10-12", "2026-10-13"]}
            counts={{}}
            today="2026-10-12"
            href={(date) => `/jour/${date}`}
            onDragOverDay={onDragOverDay}
            onDropDay={onDropDay}
          />
        </MemoryRouter>,
      );
    });

    const target = container.querySelector<HTMLElement>('[data-drop-day="2026-10-13"]');
    expect(target).not.toBeNull();
    const over = new Event("dragover", { bubbles: true, cancelable: true });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    act(() => {
      target?.dispatchEvent(over);
      target?.dispatchEvent(drop);
    });

    expect(over.defaultPrevented).toBe(true);
    expect(onDragOverDay).toHaveBeenCalledWith("2026-10-13");
    expect(onDropDay).toHaveBeenCalledWith("2026-10-13");
  });
});
