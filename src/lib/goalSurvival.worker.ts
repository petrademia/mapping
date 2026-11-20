import { computeGoalSurvival, type GoalSurvivalRequest, type GoalSurvivalResult } from "./goalSurvival";
import { reply, type WorkerReply } from "./workerReply";

/**
 * How many interruptions each Hand Goal can take, run off the page's main thread: one exact pass
 * over every hand, which takes a second or more with many goals.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<GoalSurvivalRequest>) => void) | null;
  postMessage: (message: WorkerReply<GoalSurvivalResult>) => void;
};

scope.onmessage = (event) => scope.postMessage(reply(computeGoalSurvival, event.data));
