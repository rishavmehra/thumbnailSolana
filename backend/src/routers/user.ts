import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from "jsonwebtoken"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { authMiddleware } from "../middleware";
import { JWT_SECRET } from "..";
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { createTaskInput } from "../types";

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
                amount: "1",
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
