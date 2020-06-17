import Store from "../store";

const TEST = "TEST";

describe("Store", () => {
  it("committing mutations", () => {
    const store = new Store({
      state: {
        a: 1,
      },
      mutations: {
        [TEST](state, n) {
          state.a += n;
        },
      },
    });
    store.commit(TEST, 2);
    expect(store.state.a).toBe(3);
  });

  it("committing with object style", () => {
    const store = new Store({
      state: {
        a: 1,
      },
      mutations: {
        [TEST](state, payload) {
          state.a += payload.amount;
        },
      },
    });
    store.commit({
      type: TEST,
      amount: 2,
    });
    expect(store.state.a).toBe(3);
  });

  it("asserts committed type", () => {
    const store = new Store({
      state: {
        a: 1,
      },
      mutations: {
        // Maybe registered with undefined type accidentally
        // if the user has typo in a constant type
        undefined(state, n) {
          state.a += n;
        },
      },
    });
    expect(() => {
      // @ts-expect-error
      store.commit(undefined, 2);
    }).toThrowError(/expects string as the type, but found undefined/);
    expect(store.state.a).toBe(1);
  });

  it("dispatching actions, sync", () => {
    const store = new Store({
      state: {
        a: 1,
      },
      actions: {
        [TEST]({ commit }, n) {
          commit(TEST, n);
        },
      },
      mutations: {
        [TEST](state, n) {
          state.a += n;
        },
      },
    });
    store.dispatch(TEST, 2);
    expect(store.state.a).toBe(3);
  });

  it("dispatching with object style", () => {
    const store = new Store({
      state: {
        a: 1,
      },
      mutations: {
        [TEST](state, n) {
          state.a += n;
        },
      },
      actions: {
        [TEST]({ commit }, payload) {
          commit(TEST, payload.amount);
        },
      },
    });
    store.dispatch({
      type: TEST,
      amount: 2,
    });
    expect(store.state.a).toBe(3);
  });

  it("dispatching actions, with returned Promise", async () => {
    const store = new Store({
      state: {
        a: 1,
      },
      mutations: {
        [TEST](state, n) {
          state.a += n;
        },
      },
      actions: {
        [TEST]({ commit }, n) {
          return new Promise(resolve => {
            setTimeout(() => {
              commit(TEST, n);
              resolve();
            }, 0);
          });
        },
      },
    });
    expect(store.state.a).toBe(1);
    await store.dispatch(TEST, 2).then(() => {
      expect(store.state.a).toBe(3);
    });
  });

  it("composing actions with async/await", async () => {
    const store = new Store({
      state: {
        a: 1,
      },
      mutations: {
        [TEST](state, n) {
          state.a += n;
        },
      },
      actions: {
        [TEST]({ commit }, n) {
          return new Promise(resolve => {
            setTimeout(() => {
              commit(TEST, n);
              resolve();
            }, 0);
          });
        },
        two: async ({ commit, dispatch }, n) => {
          await dispatch(TEST, 1);
          expect(store.state.a).toBe(2);
          commit(TEST, n);
        },
      },
    });
    expect(store.state.a).toBe(1);
    await store.dispatch("two", 3).then(() => {
      expect(store.state.a).toBe(5);
    });
  });

  it("asserts dispatched type", () => {
    const store = new Store({
      state: {
        a: 1,
      },
      mutations: {
        [TEST](state, n) {
          state.a += n;
        },
      },
      actions: {
        // Maybe registered with undefined type accidentally
        // if the user has typo in a constant type
        undefined({ commit }, n) {
          commit(TEST, n);
        },
      },
    });
    expect(() => {
      // @ts-expect-error
      store.dispatch(undefined, 2);
    }).toThrowError(/expects string as the type, but found undefined/);
    expect(store.state.a).toBe(1);
  });

  it("getters", () => {
    const store = new Store({
      state: {
        a: 0,
      },
      getters: {
        state: state => (state.a > 0 ? "hasAny" : "none"),
      },
      mutations: {
        [TEST](state, n) {
          state.a += n;
        },
      },
      actions: {
        check({ getters }, value) {
          // check for exposing getters into actions
          expect(getters.state).toBe(value);
        },
      },
    });
    expect(store.getters.state).toBe("none");
    store.dispatch("check", "none");

    store.commit(TEST, 1);

    expect(store.getters.state).toBe("hasAny");
    store.dispatch("check", "hasAny");
  });

  it("invokes getters only when its dependencies changed", () => {
    const stateGetter = jest.fn((state: any) =>
      state.a > 0 ? "hasAny" : "none"
    );

    const store = new Store({
      state: {
        a: 0,
      },
      getters: {
        state: stateGetter,
      },
      mutations: {
        [TEST](state, n) {
          state.a = n;
        },
      },
    });

    expect(store.getters.state).toBe("none");
    expect(stateGetter).toBeCalledTimes(1);

    store.commit(TEST, 0);

    expect(store.getters.state).toBe("none");
    expect(stateGetter).toBeCalledTimes(1);

    store.commit(TEST, 1);

    expect(store.getters.state).toBe("hasAny");
    expect(stateGetter).toBeCalledTimes(2);

    store.commit(TEST, 1);

    expect(store.getters.state).toBe("hasAny");
    expect(stateGetter).toBeCalledTimes(2);
  });
});
