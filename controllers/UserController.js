import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import User from '../models/User.js'; // Убедитесь, что путь правильный
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import mongoose from 'mongoose';
import OpenAI from 'openai';

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
  credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

export const register = async (req, res) => {
  try {
    // Хэширование пароля
    const salt = await bcrypt.genSalt(10); // Генерация соли
    const hashedPassword = await bcrypt.hash(req.body.password, salt); // Хэширование пароля

    // Создание нового пользователя
    const newUser = new User({
      email: req.body.email,
      name: req.body.name,
      password: hashedPassword, // Используем хэшированный пароль
      role: req.body.role
    });

    // Сохранение пользователя в базе данных
    const savedUser = await newUser.save();

    // Генерация токена
    const token = jwt.sign({ _id: savedUser._id }, 'secret123', { expiresIn: '30d' });

    // Ответ клиенту
    res.json({ token, ...savedUser._doc });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Не удалось зарегистрироваться' });
  }
};


export const login = async (req, res) => {
    try {
      // Поиск пользователя по email
      const user = await User.findOne({ email: req.body.email });
  
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }
  
      // Проверка пароля
      const isPasswordValid = await bcrypt.compare(req.body.password, user.password);
  
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Неверный логин или пароль' });
      }
  
      // Генерация JWT
      const token = jwt.sign({ _id: user._id }, 'secret123', { expiresIn: '30d' });
  
      // Возвращаем данные пользователя без пароля
      const { password, ...userData } = user._doc;
      res.json({ token, ...userData });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Не удалось войти в аккаунт' });
    }
  };



// export const updateUserInfo = async (req, res) => {
//   try {
//     const userId = req.params.id; 
//     const { city, country, job, oblast } = req.body;

//     const updatedUser = await User.findByIdAndUpdate(
//       userId,
//       { city, country, job, oblast }, // Обновляемые поля
//       { new: true } // Возвращаем обновленный объект
//     );

//     if (!updatedUser) {
//       return res.status(404).json({ message: 'Пользователь не найден' });
//     }

//     res.json({ message: 'Информация обновлена', user: updatedUser });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Не удалось обновить информацию' });
//   }
// };

export const getTelegramId = async (req, res) => {
  const initData = req.body.initData;
  const botToken = '7661158481:AAFc3G5gOameDLtudD8X_tX6IEsyoXKBlOc'; // Укажите токен вашего бота

  if (!initData || !botToken) {
    return res.status(400).json({ error: 'initData или токен не предоставлены' });
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const signature = urlParams.get('signature');
    urlParams.delete('signature'); 

    const userParam = urlParams.get('user');
    if (!userParam) {
      return res.status(400).json({ error: 'Параметр user отсутствует!' });
    }

    const user = JSON.parse(userParam);
    let existingUser = await User.findOne({ telegramId: user.id });

    if (existingUser) {
      return res.json({ status: 'Пользователь с таким Telegram ID уже существует.', user: existingUser });
    }

    // Создаем нового пользователя, если не найден
    const newUser = new User({
      telegramId: user.id
    });

    await newUser.save();

    return res.json({ 
      status: 'Новый пользователь создан.', 
      user: newUser, 
      telegramId: newUser.telegramId 
    });

  } catch (error) {
    console.error('Ошибка при обработке данных:', error);
    return res.status(500).json({ error: 'Ошибка при обработке initData.' });
  }
};


export const getSubscribe = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.body.id });
    if (user) {
      user.subscribe = true;
      await user.save();
      return res.status(200).json({ message: 'Подписка успешно оформлена', user });
    } else {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось оформить подписку' });
  }
};


export const getUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id });

    if (user) {
      if (user.avatar) {
        // Генерируем временную ссылку для доступа к аватару
        const getObjectParams = {
          Bucket: bucketName,
          Key: user.avatar,
        };

        const command = new GetObjectCommand(getObjectParams);
        const avatarUrl = await getSignedUrl(s3, command, { expiresIn: 3600 }); // Срок действия ссылки — 1 час

        // Включаем ссылку на аватар в ответ
        const userWithAvatarUrl = { ...user._doc, avatar: avatarUrl };

        res.json(userWithAvatarUrl);
      } else {
        // Если аватар отсутствует, возвращаем пользователя без изменений
        res.json(user);
      }
    } else {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось получить данные пользователя' });
  }
};


export const uploadPhoto = async (req, res) => {
  const userId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Upload file to S3
    const buffer = await sharp(req.file.buffer).toBuffer();
    const imageName = `${userId}_${Date.now()}`;

    const params = {
      Bucket: bucketName,
      Key: imageName,
      Body: buffer,
      ContentType: req.file.mimetype,
    };

    const command = new PutObjectCommand(params);
    await s3.send(command);

    // Update the user's photo field
    user.avatar = imageName;
    await user.save();

    res.json({ message: 'Фото успешно загружено', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при загрузке фото' });
  }
};

export const saveAnalysis = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.body.id });
    if (user) {
      user.analysis.videoUrl = req.body.videoUrl
      await user.save();
      return res.status(200).json({ message: 'Подписка успешно оформлена', user });
    } else {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось оформить подписку' });
  }
};

export const generatePrompt = async (req, res) => {
  const { prompt } = req.body;
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI,
    apiKey: process.env.OPENAI,
  });
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10000,
    });
    res.json({ content: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate response.' });
  }
};

export const saveTrainingPlan = async (req, res) => {
  try {
    const { userId, trainingPlan } = req.body;

    if (!userId || !trainingPlan) {
      return res.status(400).json({ message: 'Необходимо указать userId и trainingPlan' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    user.trainingPlan = trainingPlan;
    await user.save();

    return res.status(200).json({ message: 'План тренировок успешно сохранен', user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось сохранить план тренировок' });
  }
};

