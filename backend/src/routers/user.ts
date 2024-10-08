import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from "jsonwebtoken"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { authMiddleware } from "../middleware";
import { JWT_SECRET } from "..";
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { createTaskInput } from "../types";
import { number } from "zod";
import { TOTAL_DECIMALS } from "../config";

const DEFAULT_TITLE = "Select the most clickable thumbnail"

const prismaClient = new PrismaClient();
const router = Router();

const s3Client = new S3Client({
    credentials: {
        accessKeyId: "",
        secretAccessKey: ""
    },
    region: "ap-south-1"
});

// @ts-ignore
router.get("/task", authMiddleware, async(req, res)=>{
    // @ts-ignore
    const userId: string = req.userId;
    // @ts-ignore
    const taskId: string = req.query.taskId;

    const taskDetails = await prismaClient.task.findFirst({
        where:{
            user_id:  Number(userId),
            id: Number(taskId)
        },
        include:{
            options: true
        }
    })

    if (!taskDetails){
        res.status(411).json({
            message:"you dont have to access this task"
        })
    }

    const response = await prismaClient.submission.findMany({
        where:{
            task_id: Number(taskId)
        },
        include:{
            option: true
        }
    })

    const result: Record<string, {
        count: number,
        option: {
            imageUrl: string
        }
    }> = {};

    // @ts-ignore
    taskDetails.options.forEach(option =>{
        result[option.id]={
            count: 0,
            option: {
                imageUrl: option.image_url
            }
        }
    })

    response.forEach(r=>{ 
            result[r.options_id].count++
    });
    res.json({
        result
    })
})

// @ts-ignore
router.post("/task", authMiddleware,  async(req, res)=>{
    // @ts-ignore
    const userId = req.userId
    const body = req.body;

    const parseData = createTaskInput.safeParse(body)
    if (!parseData.success){
        return res.status(411).json({
            message: "you sent the wrong input"
        })
    }

    const response = await prismaClient.$transaction(async tx =>{
        const response = await tx.task.create({
            data: {
                title: parseData.data.title ?? DEFAULT_TITLE,
                amount: 1*TOTAL_DECIMALS,
                signature: parseData.data.signature,
                user_id: userId
            }
        });
        await tx.option.createMany({
            data: parseData.data.options.map( x =>({
                image_url: x.imageUrl,
                task_id: response.id
            }))
        })
        return response
    })

    res.json({
        id: response.id
    })
} ) 

// @ts-ignore
router.get("/presignedUrl", authMiddleware, async (req, res) => {
    //@ts-ignore
    const userId = req.userId;

    const { url, fields } = await createPresignedPost(s3Client, {
        Bucket: 'thumbnail-solana',
        Key: `images/${userId}/${Math.random()}/image.jpg`,
        Conditions: [
          ['content-length-range', 0, 5 * 1024 * 1024] // 5 MB max
        ],
        Fields: {
          'Content-Type': 'image/png'
        },
        Expires: 3600
      })

    console.log(url, fields);

    res.json({
        url: url
    })
})


router.post("/signin", async(req, res)=>{
    const hardcodedWalletAddress = "6Y9f7LRhfJSKumRVN4w2TmTqhuDUz3F2LxU9rVdSRyiH"
    
    const existingUser = await prismaClient.user.findFirst({
        where: {
            address: hardcodedWalletAddress
        }
    }) 

    if (existingUser) {
        const token = jwt.sign({
            userId: existingUser.id
        }, JWT_SECRET)
        res.json({
            token
        })
        console.log("jwt: ", token);
    } else{
        const user = await prismaClient.user.create({
            data:{
                address: hardcodedWalletAddress
            }
        })
        const token = jwt.sign({
            userId: user.id
        }, JWT_SECRET)
        res.json({
            token
        })
        console.log("jwt: ", token);
        
    }

});

export default router;
