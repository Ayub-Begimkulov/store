import { isObject, isPromise, setFromForeachable, isArray } from "./utils";
import { AnyObject, AnyFunction, StringKeys } from "./types";

// move to constants file since we use it in a lot of places
const NOT_PRODUCTION =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

type Payload<T extends string> = {
  type: T;
  [key: string]: any;
};

type Getters<G> = {
  [K in keyof G]: G[K] extends AnyFunction ? ReturnType<G[K]> : G[K];
};

type Getter<S> = (state: S, getters: Record<string, AnyFunction>) => any;

type Action<S> = (ctx: ActionContext<S>, payload?: any) => any;

type Mutation<S> = (state: S, payload?: any) => any;

interface ActionContext<S> {
  dispatch: Dispatch;
  commit: Commit;
  getters: Record<string, AnyFunction>;
  state: S;
}

type Dispatch = {
  (payload: Payload<string>): Promise<any>;
  (_type: string, payload?: any): Promise<any>;
};

type Commit = {
  (payload: Payload<string>): any;
  (_type: string, payload?: any): any;
};

type ActionKey<T> = T extends { type: string }
  ? T["type"]
  : T extends string
  ? T
  : any;

type PayloadType<T extends AnyObject, K> = Parameters<T[ActionKey<K>]>[1];

export default class Store<
  S extends AnyObject,
  G extends Record<string, Getter<S>>,
  A extends Record<string, Action<S>>,
  M extends Record<string, Mutation<S>>
> {
  _state: S;
  _getters: AnyObject;
  _actions: AnyObject;
  _mutations: AnyObject;
  strict: boolean;
  isCommitting: boolean;
  subscribers = new Set<Function>();

  constructor({
    state = {} as S,
    actions = {} as A,
    mutations = {} as M,
    getters = {} as G,
    strict = true,
  }: {
    state?: S;
    actions?: A;
    mutations?: M;
    getters?: G;
    strict?: boolean;
  }) {
    this.isCommitting = false;
    const store = this;

    this.strict = strict;
    this._getters = {};
    this._actions = {};
    this._mutations = {};
    this._state = this._initState(state);

    const { dispatch, commit } = this;

    this.dispatch = function boundDispatch(type, payload) {
      return dispatch.call(store, type, payload);
    };
    this.commit = function boundCommit(type, payload) {
      return commit.call(store, type, payload);
    };

    forEachEntry(getters, ([key, value]) => registerGetter(store, key, value));
    forEachEntry(actions, ([key, value]) => registerAction(store, key, value));
    forEachEntry(mutations, ([key, value]) =>
      registerMutation(store, key, value)
    );
  }

  get state() {
    return this._state;
  }

  get getters() {
    return this._getters as Getters<G>;
  }

  dispatch<T extends Payload<StringKeys<A>> | StringKeys<A>>(
    _type: T,
    _payload?: PayloadType<A, T>
  ): Promise<any> {
    const { type, payload } = toObjectStyle(_type, _payload);
    const action = this._actions[type];
    const result = action(payload);
    return result;
  }

  commit<T extends Payload<StringKeys<M>> | StringKeys<M>>(
    _type: T,
    _payload?: PayloadType<M, T>
  ) {
    const { type, payload } = toObjectStyle(_type, _payload);
    const mutation = this._mutations[type];
    this._withCommit(() => {
      mutation(payload);
    });
    const { state, subscribers } = this;
    const mutationArguments = { type, payload };
    // make a copy of subscribers to not end up in
    // an infinite loop, when subscriber and another subscriber
    const subscribersCopy = setFromForeachable(subscribers);
    subscribersCopy.forEach(sub => sub(mutationArguments, state));
  }

  subscribe<T extends { type: StringKeys<M>; payload: any }>(
    fn: (mutation: T, state: S) => any
  ) {
    const { subscribers } = this;
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }

  private _withCommit(cb: Function) {
    const isCommitting = this.isCommitting;
    this.isCommitting = true;
    cb();
    this.isCommitting = isCommitting;
  }

  private _initState<T>(obj: T) {
    const store = this;

    return Object.entries(obj).reduce((state, [key, value]) => {
      let currentValue =
        isObject(value) && !isArray(value) ? this._initState(value) : value;

      Object.defineProperty(state, key, {
        get() {
          return currentValue;
        },
        set(newVal) {
          if (store.strict && !store.isCommitting && NOT_PRODUCTION) {
            throw new Error(
              "do not mutate store state outside mutation handlers"
            );
          }

          currentValue = newVal;
        },
        enumerable: true,
      });
      return state;
    }, {} as S);
  }
}

function forEachEntry(obj: AnyObject, handler: AnyFunction) {
  Object.entries(obj).forEach(handler);
}

function registerGetter(
  store: Store<any, any, any, any>,
  type: string,
  handler: AnyFunction
) {
  if (store._getters[type]) {
    if (NOT_PRODUCTION) {
      throw new Error(`duplicate getter ${type}`);
    }
    return;
  }
  const getter = () => handler(store.state, store.getters);
  Object.defineProperty(store._getters, type, {
    get() {
      return getter();
    },
  });
}

function registerAction(
  store: Store<any, any, any, any>,
  type: string,
  handler: AnyFunction
) {
  if (store._actions[type]) {
    if (NOT_PRODUCTION) {
      throw new Error(`duplicate action ${type}`);
    }
    return;
  }
  store._actions[type] = (payload: any) => {
    let res = handler.call(
      store,
      {
        dispatch: store.dispatch,
        commit: store.commit,
        getters: store.getters,
        state: store.state,
      },
      payload
    );
    if (!isPromise(res)) {
      res = Promise.resolve(res);
    }
    return res;
  };
}

function registerMutation(
  store: Store<any, any, any, any>,
  type: string,
  handler: AnyFunction
) {
  if (store._mutations[type]) {
    if (NOT_PRODUCTION) {
      throw new Error(`duplicate mutation ${type}`);
    }
    return;
  }
  store._mutations[type] = (payload: any) => {
    handler.call(store, store.state, payload);
  };
}

function toObjectStyle(_type: string | Payload<string>, _payload: any) {
  let type: string;
  let payload: any;

  if (isPayload(_type)) {
    payload = _type;
    type = _type.type;
  } else {
    payload = _payload;
    type = _type;
  }

  if (NOT_PRODUCTION) {
    // do you have a better name?)
    const typeOfType = typeof type;
    if (typeOfType !== "string") {
      throw new TypeError(
        `expects string as the type, but found ${typeOfType}.`
      );
    }
  }

  return {
    type,
    payload,
  };
}

function isPayload(val: unknown): val is Payload<string> {
  return isObject(val) && val.type;
}

// const store = new Store({
//   state: {
//     todos: ["asdf"],
//     test: {
//       a: 1,
//     },
//   },
//   getters: {
//     todosCount: state => state.todos.length,
//   },
//   actions: {
//     addTodo(ctx, payload: string) {
//       ctx.commit("addTodo", payload);
//     },
//     removeTodo(ctx, payload: string) {
//       ctx.commit("removeTodo", payload);
//     },
//   },
//   mutations: {
//     addTodo(state, payload: string) {
//       state.todos.push(payload);
//     },
//     updateTest(state) {
//       state.test.a = Math.random();
//     },
//   },
// });

// ok
// store.state.todos;
// store.getters.todosCount;
// store.dispatch("addTodo");
// store.dispatch({ type: "addTodo" });
// store.commit("addTodo");
// store.commit({ type: "addTodo" });
// store.subscribe(({ type, payload }, state) => {
//   console.log(type, payload, state);
// });
// // error
// store.state.todos1;
// store.getters.adsfads;
// store.dispatch("hello");
// store.commit({ type: "132addTodo" });
// store.dispatch({ hello: 1 });
// store.commit("hello");
// store.commit({ hello: 1 });

// @ts-ignore
// window.store = store;
