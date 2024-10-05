import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  console.log('Scraping assignments');
  if (req.method === 'POST') {
    try {
      const { url } = req.body;
      const response = await axios.get(url);
      console.log('Scraping URL:', url);
      
      if (!cheerio || typeof cheerio.load !== 'function') {
        console.error('Cheerio is not properly imported:', cheerio);
        throw new Error('Cheerio is not properly imported');
      }

      const $ = cheerio.load(response.data);
      
      // Extract text content from the webpage
      const pageContent = $('body').text().trim();

      // Use ChatGPT to process the content
      const chatGPTResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {role: "system", content: "You are a helpful assistant that extracts detailed assignment and exam information from course websites."},
          {role: "user", content: `Extract all assignments and exams with their details from the following course website content. Format the output as a JSON array of objects, each with properties: 
          - assignmentName: string (the formal name of the assignment as listed on the website). In title case and not including the class name.
          - dueDate: string (in YYYY-MM-DD format, or 'TBD' if not specified)
          - releaseDate: string (in YYYY-MM-DD format, or 'TBD' if not specified)
          - timeNeeded: number (estimated time needed in minutes, or 0 if not specified)
          - classId: string (the formal course code or name, e.g., 'CS 101', 'EE 16A', or class name if not specified). Otherwise, use 'Unknown'.
          - status: number (percentage of completion, default to 0)
          
          If any information is not available, use appropriate default values. \n\nWebsite content:\n${pageContent}`}
        ],
      });

      // Parse the message content to extract only the JSON part
      const rawContent = chatGPTResponse.choices[0].message.content;
      const jsonStartIndex = rawContent.indexOf('[');
      const jsonEndIndex = rawContent.lastIndexOf(']') + 1;
      const jsonString = rawContent.substring(jsonStartIndex, jsonEndIndex);
      const extractedData = JSON.parse(jsonString);

      const assignments = extractedData.map(item => ({
        assignmentName: item.assignmentName,
        dueDate: item.dueDate || 'TBD',
        releaseDate: item.releaseDate || 'TBD',
        timeNeeded: item.timeNeeded || 0,
        classId: item.classId || 'Unknown',
        status: item.status || 0,
        complete: false
      }));

      console.log('Extracted assignments:', assignments);
      res.status(200).json(assignments);
    } catch (error) {
      console.error('Error in scrape-assignments:', error);
      res.status(500).json({ error: 'Failed to scrape assignments', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}