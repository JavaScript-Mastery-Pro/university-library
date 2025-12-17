import { config } from "dotenv";
import ImageKit from "imagekit";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

import { books } from "./schema";

config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql });

const dummyBooks = [
  {
    title: "Artificial Intelligence: A Modern Approach",
    author: "Stuart Russell and Peter Norvig",
    genre: "Artificial Intelligence",
    rating: 4,
    coverUrl:
      "https://m.media-amazon.com/images/I/61nHC3YWZlL._AC_UF1000,1000_QL80_.jpg",
    coverColor: "#c7cdd9",
    description:
      "A leading textbook on artificial intelligence, offering a deep dive into algorithms, machine learning, and robotics, suitable for both beginners and professionals.",
    totalCopies: 10,
    videoUrl:
      "https://www.shutterstock.com/shutterstock/videos/3482284603/preview/stock-footage-new-book-opening-green-screen-k-video-animation-chrome-key.webm",
    summary:
      "Artificial Intelligence: A Modern Approach is a comprehensive guide to the field of AI, combining foundational concepts with cutting-edge research. The book covers topics like search algorithms, knowledge representation, machine learning, and robotics. \n\nIts clear explanations and practical examples make it a valuable resource for students, researchers, and industry professionals. By bridging theory and application, this book serves as a cornerstone for understanding and advancing AI technologies. \n\nThe book is suitable for both beginners and professionals, offering a deep understanding of the fundamental concepts and applications of AI.",
  },
  {
    title: "Computer Networking: A Top-Down Approach",
    author: "James F. Kurose and Keith W. Ross",
    genre: "Networking",
    rating: 5,
    coverUrl:
      "https://m.media-amazon.com/images/I/91hg1HHyiWL._AC_UF1000,1000_QL80_.jpg",
    coverColor: "#f7a13e",
    description:
      "A comprehensive introduction to computer networking, using a top-down approach to explain protocols, architecture, and applications.",
    totalCopies: 25,
    videoUrl:
      "https://www.shutterstock.com/shutterstock/videos/1107129903/preview/stock-footage-an-open-book-is-on-fire-big-bright-flame-burning-paper-on-old-publication-in-the-dark-book.webm",
    summary:
      "'Computer Networking: A Top-Down Approach' provides a thorough and accessible introduction to the world of computer networks. James Kurose and Keith Ross present networking concepts by starting with high-level applications like web browsers and email, gradually moving down to the underlying layers of networking protocols. \n\nThe book covers essential topics such as HTTP, DNS, TCP/IP, and network security. Each chapter includes practical examples, hands-on exercises, and real-world scenarios to help readers grasp complex concepts. The authors also explore emerging trends like cloud computing and the Internet of Things, ensuring that the material remains relevant in a rapidly evolving field. \n\nWhether you're a student, professional, or enthusiast, this book offers a clear and engaging path to understanding the architecture and operation of modern computer networks.",
  },
];

const imagekit = new ImageKit({
  publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY!,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY!,
  urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT!,
});

async function uploadToImageKit(url: string, fileName: string, folder: string) {
  try {
    const response = await imagekit.upload({
      file: url,
      fileName: fileName,
      folder,
    });
    return response.filePath;
  } catch (error) {
    console.error(`Error uploading ${fileName} to ImageKit:`, error);
    throw error;
  }
}

async function seed() {
  console.log("Seeding books...");

  try {
    for (const book of dummyBooks) {
      const coverUrl = await uploadToImageKit(
        book.coverUrl,
        `${book.title}.jpg`,
        "/books/covers"
      );

      const videoUrl = await uploadToImageKit(
        book.videoUrl,
        `${book.title}.mp4`,
        "/books/videos"
      );

      await db.insert(books).values({
        ...book,
        coverUrl,
        videoUrl,
      });

      console.log(`Added book: ${book.title}`);
    }

    console.log("Seeding completed successfully.");
  } catch (error) {
    console.error("Error seeding books:", error);
  }
}

seed();
