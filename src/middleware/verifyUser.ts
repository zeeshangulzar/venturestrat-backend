import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/clerk-sdk-node';

declare global {
  namespace Express {
    interface Request {
      user?: {
        session: any;
        userId: string;
        claims: any;
      };
    }
  }
}

const verifyUser = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { session, userId, claims } = await verifyToken(token, {});

    req.user = { session, userId: String(userId), claims };

    next();
  } catch (error) {
    console.error('Error verifying session:', error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export default verifyUser;
