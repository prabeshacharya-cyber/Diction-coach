import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import coachRouter from "./coach";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(coachRouter);

export default router;
