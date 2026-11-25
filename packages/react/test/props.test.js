import { describe, expect, it } from "vitest";

import { shouldAssign, splitProps, toAttributeName, toAttributeValue, toEventName } from "../src/props.js";

describe("toAttributeName", () => {
  it("turns camelCase props into the element's kebab-case attributes", () => {
    expect(toAttributeName("styleUrl")).toBe("style-url");
    expect(toAttributeName("popupHrefLabel")).toBe("popup-href-label");
    expect(toAttributeName("tiles")).toBe("tiles");
  });

  it("leaves names that are already kebab-case alone", () => {
    expect(toAttributeName("style-url")).toBe("style-url");
    expect(toAttributeName("aria-label")).toBe("aria-label");
  });
});

describe("toEventName", () => {
  it("maps onMmjRouteChange to the element's event name", () => {
    expect(toEventName("onMmjRouteChange")).toBe("mmj-route-change");
    expect(toEventName("onMmjReady")).toBe("mmj-ready");
    expect(toEventName("onClick")).toBe("click");
  });

  it("does not treat ordinary attributes that start with 'on' as events", () => {
    expect(toEventName("one")).toBeNull();
    expect(toEventName("tiles")).toBeNull();
  });
});

describe("toAttributeValue", () => {
  it("writes booleans the way HTML does: present or absent", () => {
    expect(toAttributeValue(true)).toBe(true);
    expect(toAttributeValue(false)).toBeNull();
    expect(toAttributeValue(null)).toBeNull();
    expect(toAttributeValue(undefined)).toBeNull();
  });

  it("joins a [lng, lat] pair the way the element reads it", () => {
    expect(toAttributeValue([135.5, 34.69])).toBe("135.5,34.69");
    expect(toAttributeValue(13)).toBe("13");
  });
});

const onChange = () => {};

describe("splitProps", () => {
  it("separates attributes, events and properties", () => {
    const split = splitProps(
      { from: "駅", fit: true, hidden: false, onMmjRouteChange: onChange, value: { type: "FeatureCollection" }, children: "x", key: "k" },
      ["value"],
    );
    expect(split.attributes).toEqual({ from: "駅", fit: true });
    expect(split.events).toEqual({ "mmj-route-change": onChange });
    expect(split.properties).toEqual({ value: { type: "FeatureCollection" } });
  });

  it("hands style and className to React as they are", () => {
    const style = { height: 400 };
    const split = splitProps({ style, className: "map" }, []);
    expect(split.attributes).toEqual({ style, className: "map" });
  });

  it("drops an event prop that is not a function instead of writing it as an attribute", () => {
    expect(splitProps({ onMmjReady: undefined }, [])).toEqual({ attributes: {}, events: {}, properties: {} });
  });
});

describe("shouldAssign", () => {
  const route = { type: "FeatureCollection", features: [] };

  it("does not reassign when the prop did not change", () => {
    expect(shouldAssign(route, route, null)).toBe(false);
  });

  it("does not reassign what the element already holds (keeps the editor's undo history)", () => {
    // 受け取った geojson を state に入れて戻すと、物は新しいが中身は同じ
    expect(shouldAssign(undefined, structuredClone(route), route)).toBe(false);
    expect(shouldAssign(undefined, JSON.stringify(route), route)).toBe(false);
  });

  it("assigns a value that differs from what the element holds", () => {
    expect(shouldAssign(undefined, route, { type: "FeatureCollection", features: [{}] })).toBe(true);
    expect(shouldAssign(undefined, "{not json", route)).toBe(true);
  });
});
