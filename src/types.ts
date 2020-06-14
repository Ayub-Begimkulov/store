export type AnyObject = Record<string, any>;

export type AnyFunction = (...args: any[]) => any;

export type StringKeys<T extends AnyObject> = Extract<keyof T, string>;

export type Foreachable = {
  forEach: AnyFunction;
};

export type FirstParam<T extends (...args: any[]) => any> = Parameters<T>[0];

export type ForeachableValueType<T extends Foreachable> = FirstParam<
  FirstParam<T["forEach"]>
>;
