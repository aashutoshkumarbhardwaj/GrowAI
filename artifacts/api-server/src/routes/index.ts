import { Router, type IRouter } from "express";
import healthRouter from "./health";
import csvRouter from "./csv";

const router: IRouter = Router();

router.use(healthRouter);
router.use(csvRouter);

export default router;
