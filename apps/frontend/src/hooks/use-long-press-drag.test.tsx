import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLongPressDrag } from "./use-long-press-drag";

function touch(type: string, x = 20, y = 20): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y, identifier: 1 }] },
    changedTouches: { value: [{ clientX: x, clientY: y, identifier: 1 }] },
  });
  return event;
}

describe("useLongPressDrag touch gestures", () => {
  let root: Root;
  let container: HTMLDivElement;
  let row: HTMLLIElement;
  let end: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    end = jest.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    const target = document.createElement("div");
    target.dataset.dropDay = "2026-10-26";
    document.body.appendChild(target);
    document.elementFromPoint = jest.fn(() => target);
    root = createRoot(container);
    function Harness() {
      const drag = useLongPressDrag({ onEnd: end });
      return <ul><li data-dragging={drag.dragging} {...drag.handlers("preparation")}>Pâte à sablés</li></ul>;
    }
    act(() => root.render(<Harness />));
    row = container.querySelector("li")!;
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
    jest.useRealTimers();
  });

  it("finishes a lifted touch through native touchend after the browser cancels its pointer", () => {
    act(() => row.dispatchEvent(touch("touchstart")));
    act(() => jest.advanceTimersByTime(450));
    expect(row.dataset.dragging).toBe("true");
    const cancel = new Event("pointercancel", { bubbles: true });
    Object.defineProperties(cancel, { pointerType: { value: "touch" }, pointerId: { value: 2 } });
    act(() => row.dispatchEvent(cancel));
    const move = touch("touchmove", 30, 150);
    act(() => row.dispatchEvent(move));
    expect(move.defaultPrevented).toBe(true);
    act(() => row.dispatchEvent(touch("touchend", 30, 150)));
    expect(end).toHaveBeenCalledWith("2026-10-26", "preparation");
    expect(row.dataset.dragging).toBe("false");
  });

  it("leaves an ordinary scroll alone when the finger moves before the hold", () => {
    act(() => row.dispatchEvent(touch("touchstart")));
    const move = touch("touchmove", 20, 80);
    act(() => row.dispatchEvent(move));
    act(() => jest.advanceTimersByTime(500));
    expect(move.defaultPrevented).toBe(false);
    expect(row.dataset.dragging).toBe("false");
    act(() => row.dispatchEvent(touch("touchend", 20, 80)));
    expect(end).not.toHaveBeenCalled();
  });

  it("cleans up a cancelled touch without moving the preparation", () => {
    act(() => row.dispatchEvent(touch("touchstart")));
    act(() => jest.advanceTimersByTime(450));
    act(() => row.dispatchEvent(touch("touchcancel")));
    act(() => row.dispatchEvent(touch("touchend")));
    expect(end).not.toHaveBeenCalled();
    expect(row.dataset.dragging).toBe("false");
  });
});
