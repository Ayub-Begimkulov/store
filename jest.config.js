module.exports = {
  preset: "ts-jest",
  collectCoverageFrom: ["src/**/*.{js,jsx,ts,tsx}", "!<rootDir>/node_modules/"],
  transformIgnorePatterns: ["node_modules/?!(observable)"],
};
