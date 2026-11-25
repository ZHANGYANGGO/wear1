import {launch} from "../app.mjs";
import {testBook} from "./fixtures.mjs";
launch(testBook(),new URLSearchParams(location.search).get("level") || "duo");
