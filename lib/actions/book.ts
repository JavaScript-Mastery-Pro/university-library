"use server";

import { db } from "@/database/drizzle";
import { books } from "@/database/schema";

export async function createBook(params: BookParams) {
  try {
    const newBook = await db.insert(books).values(params);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(newBook)),
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      error: "Error creating book",
    };
  }
}