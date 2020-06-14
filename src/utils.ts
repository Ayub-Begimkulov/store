import { Foreachable, ForeachableValueType } from "./types";

export const isObject = (val: unknown): val is Record<string, any> => {
  return typeof val === "object" && val !== null;
};

export const isFunction = (val: unknown): val is Function => {
  return typeof val === "function";
};

export const isArray = Array.isArray;

export const isPromise = (val: unknown): val is Promise<any> => {
  return isObject(val) && isFunction(val.then) && isFunction(val.catch);
};

export const setFromForeachable = <T extends Foreachable>(val: T) => {
  const set = new Set<ForeachableValueType<T>>();
  val.forEach(set.add, set);
  return set;
};
