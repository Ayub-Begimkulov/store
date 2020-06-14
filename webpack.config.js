const path = require("path");

module.exports = {
  mode: "development",
  entry: path.resolve(__dirname, "src", "index.ts"),
  devtool: "inline-source-map",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  devServer: {
    hot: true,
  },
  resolve: {
    extensions: [".js", ".ts"],
  },
  module: {
    rules: [
      {
        test: /\.ts/,
        loader: "ts-loader",
      },
    ],
  },
};
