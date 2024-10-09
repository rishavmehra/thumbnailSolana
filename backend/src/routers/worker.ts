import { Router } from "express";
import jwt from "jsonwebtoken"
import { PrismaClient } from "@prisma/client";
import { workerMiddleware } from "../middleware";
import { getNextTask } from "../db";
import { createSubmissionInput } from "../types";
import { TOTAL_DECIMALS } from "../config";

export const WORKER_JWT_SECRET = "rishav"+"worker";

const prismaClient = new PrismaClient();

const router = Router();
const TOTAL_SUBMISSIONS = 100;

// @ts-ignore
router.post("/payout", workerMiddleware, async (req, res)=>{
    // @ts-ignore
    const userId = req.userId
    const worker = await prismaClient.worker.findFirst({
        where: {id: Number(userId)}
    })
    if (!worker){
        return res.status(403).json({
            message: "User Not Found"
        })
    }

    const address = worker.address

    const txnId = "0xdsjk12"
    await prismaClient.$transaction(async tx => {
        await tx.worker.update({
            where: {
                id: Number(userId)
            },
            data:{
                pending_amount:{
                    decrement: worker.pending_amount
                },
                locked_amount: {
                increment: worker.pending_amount
            }
            }
        })
        await tx.payouts.create({
            data: {
                user_id: userId,
                amount: worker.pending_amount,
                status: "Processing",
                signature: txnId
            }
        })
    })

    res.json({
        message: "Processing payout",
        amount: worker.pending_amount
    })

})


// @ts-ignore
router.get("/balance", workerMiddleware, async (req,  res)=>{
    // @ts-ignore
    const userId: string = req.userId;

    const worker = await prismaClient.worker.findFirst({
        where:{
            id: Number(userId)
        }
    })

    res.json({
        pendingAmount: worker?.pending_amount,
        lockedAmount: worker?.locked_amount
    })

})

// @ts-ignore
router.post("/submission", workerMiddleware, async(req, res)=>{
    // @ts-ignore
    const userId = req.userId;
    const body = req.body;
    const parsedBody = createSubmissionInput.safeParse(body)
    
    if(parsedBody.success){
        const task = await getNextTask(Number(userId));
        if(!task || task.id !== Number(parsedBody.data.taskId)){
            return res.status(411).json({
                message:"Incorrect Task Id"
            })
        }

        const amount = (Number(task.amount) / TOTAL_SUBMISSIONS);


        const submission = prismaClient.$transaction(async tx  =>{
            const submission = await tx.submission.create({
                data:{
                    options_id: Number(parsedBody.data.selection),
                    worker_id: userId,
                    task_id: Number(parsedBody.data.taskId),
                    amount
                }   
            })
            await prismaClient.worker.update({
                where:{
                    id: userId,
                }, data:{
                    pending_amount:{
                        increment: Number(amount)
                    }
                }
            })
            return submission
        })

        const nextTask = await getNextTask(Number(userId))
        res.json({
            nextTask,
            amount
        })
    }   
})

// @ts-ignore
router.get("/nextTask", workerMiddleware, async (req, res)=>{
    // @ts-ignore
    const userId = req.userId

    const task = await getNextTask(Number(userId));
    
    if(!task){
        res.status(411).json({
            message:"No more task left for you to review"
        })
    }else{
        res.status(411).json({
            task
        })
    }

})


router.post("/signin", async(req, res)=>{
    const hardcodedWalletAddress = "85Wnyyd6RNm7mow351m6hgnfQtTgUJWUph1FkZMh5Spy"
    
    const existingUser = await prismaClient.worker.findFirst({
        where: {
            address: hardcodedWalletAddress
        }
    }) 

    if (existingUser) {
        const token = jwt.sign({
            userId: existingUser.id
        }, WORKER_JWT_SECRET)
        res.json({
            token
        })
        console.log("Woker jwt: ", token);
    } else{
        const user = await prismaClient.worker.create({
            data:{
                address: hardcodedWalletAddress,
                locked_amount:0,
                pending_amount: 0
            }
        })
        const token = jwt.sign({
            userId: user.id
        }, WORKER_JWT_SECRET)
        res.json({
            token
        })
        console.log("worker jwt: ", token);
        
    }

});

export default router;
