import { useState, useEffect, useRef, useCallback } from 'react'
import { parseISO, format, isValid } from 'date-fns'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AssignmentForm } from '@/components/AssignmentForm'
import Cookies from 'js-cookie'
import axios from 'axios'
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export default function Home() {
  const { toast } = useToast()
  const [assignments, setAssignments] = useState([])
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showForm, setShowForm] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [classes, setClasses] = useState([])
  const [classColors, setClassColors] = useState({})
  const [courseInput, setCourseInput] = useState('')
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const [newClass, setNewClass] = useState('')

  useEffect(() => {
    const storedAssignments = Cookies.get('assignments')
    if (storedAssignments) {
      try {
        const parsedAssignments = JSON.parse(storedAssignments)
        setAssignments(parsedAssignments)
        setHistory([parsedAssignments])
        setHistoryIndex(0)
        updateClasses(parsedAssignments)
      } catch (error) {
        console.error('Error parsing stored assignments:', error)
        Cookies.remove('assignments')
      }
    }
  }, [])

  useEffect(() => {
    if (assignments.length > 0) {
      if (history.length === 0 || !arraysEqual(assignments, history[historyIndex])) {
        updateHistory(assignments)
        Cookies.set('assignments', JSON.stringify(assignments), { expires: 365 })
        updateClasses(assignments)
      }
    } else {
      Cookies.remove('assignments')
    }
  }, [assignments, history, historyIndex])

  const updateHistory = (newAssignments) => {
    setHistory(prevHistory => {
      const newHistory = [...prevHistory.slice(0, historyIndex + 1), newAssignments]
      setHistoryIndex(newHistory.length - 1)
      return newHistory
    })
  }

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prevIndex => prevIndex - 1)
      setAssignments(history[historyIndex - 1])
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1 && history.length > 0) {
      setHistoryIndex(prevIndex => prevIndex + 1)
      setAssignments(history[historyIndex + 1])
    }
  }

  const updateClasses = useCallback((currentAssignments) => {
    const uniqueClasses = [...new Set(currentAssignments.map(a => a.classId))]
    setClasses(prevClasses => {
      const updatedClasses = [...new Set([...prevClasses, ...uniqueClasses])]
      return updatedClasses.sort()
    })
    
    const newColors = {}
    uniqueClasses.forEach((classId, index) => {
      if (!classColors[classId]) {
        newColors[classId] = generateColor(index, uniqueClasses.length)
      }
    })
    setClassColors(prevColors => ({ ...prevColors, ...newColors }))
  }, [classColors])

  const generateColor = (index, total) => {
    const hue = (index / total) * 360
    return `hsl(${hue}, 70%, 30%)`
  }

  const handleComplete = (index) => {
    setAssignments(prevAssignments => {
      const updatedAssignments = prevAssignments.map((assignment, i) => {
        if (i === index) {
          return { ...assignment, complete: !assignment.complete }
        }
        return assignment
      })
      return updatedAssignments
    })
  }

  const handleClassChange = (index, value) => {
    setAssignments(prevAssignments => {
      const updatedAssignments = prevAssignments.map((assignment, i) => {
        if (i === index) {
          return { ...assignment, classId: value }
        }
        return assignment
      })
      return updatedAssignments
    })
    if (!classes.includes(value)) {
      setClasses(prevClasses => [...prevClasses, value].sort())
    }
  }

  const handleAddAssignment = (newAssignment) => {
    setAssignments(prevAssignments => [...prevAssignments, newAssignment])
    setShowForm(false)
  }

  const handleEditAssignment = (updatedAssignment) => {
    if (editingIndex !== null) {
      setAssignments(prevAssignments => {
        const updatedAssignments = prevAssignments.map((assignment, index) => 
          index === editingIndex ? updatedAssignment : assignment
        )
        return updatedAssignments
      })
      setEditingIndex(null)
    }
  }

  const handleDeleteAssignment = (index) => {
    setAssignments(prevAssignments => prevAssignments.filter((_, i) => i !== index))
  }

  const handleExtractAssignments = async () => {
    try {
      let endpoint, payload;
      const isUrl = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(courseInput);
      
      if (isUrl) {
        endpoint = '/api/scrape-assignments';
        payload = { url: courseInput };
      } else if (fileInputRef.current && fileInputRef.current.files[0]) {
        endpoint = '/api/extract-from-image';
        const formData = new FormData();
        formData.append('image', fileInputRef.current.files[0]);
        payload = formData;
      } else {
        endpoint = '/api/extract-from-text';
        payload = { text: courseInput };
      }

      const response = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': fileInputRef.current && fileInputRef.current.files[0] ? 'multipart/form-data' : 'application/json',
        },
      });
      const extractedAssignments = response.data;

      if (extractedAssignments.length === 0) {
        toast({
          title: "No Assignments Found",
          description: "No assignments were found in the provided input.",
          duration: 3000,
        });
        return;
      }
      
      setAssignments(prevAssignments => {
        const updatedAssignments = prevAssignments.map(existing => {
          const extracted = extractedAssignments.find(
            s => s.assignmentName.toLowerCase() === existing.assignmentName.toLowerCase()
          );
          return extracted ? { ...existing, ...extracted, classId: extracted.classId.replace(/(\w+)(\d+)/, '$1 $2') } : existing;
        });

        extractedAssignments.forEach(extracted => {
          if (!updatedAssignments.some(a => a.assignmentName.toLowerCase() === extracted.assignmentName.toLowerCase())) {
            updatedAssignments.push({
              ...extracted,
              classId: extracted.classId,
              complete: false,
              status: 0,
              timeNeeded: 0
            });
          }
        });

        return updatedAssignments;
      });

      setCourseInput('');
      toast({
        title: "Assignments Extracted",
        description: `${extractedAssignments.length} assignments added or updated.`,
        duration: 3000,
      });

      setShowForm(false);
    } catch (error) {
      console.error('Failed to extract assignments:', error);
      toast({
        title: "Error",
        description: "Failed to extract assignments. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    }
  }

  const formatDate = (dateString) => {
    if (dateString === 'TBD') return 'TBD';
    const date = parseISO(dateString);
    return isValid(date) ? format(date, 'MM/dd/yyyy') : 'Invalid Date';
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragIn = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  const handleDragOut = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    const files = e.dataTransfer.files
    if (files && files[0]) {
      await handleFileUpload(files[0])
    }
  }

  const handleFileUpload = async (file) => {
    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await axios.post('/api/extract-from-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      const extractedAssignments = response.data
      if (extractedAssignments.length === 0) {
        toast({
          title: "No Assignments Found",
          description: "No assignments were found in the provided image.",
          duration: 3000,
        });
        return;
      }
      
      setAssignments(prevAssignments => {
        const updatedAssignments = prevAssignments.map(existing => {
          const extracted = extractedAssignments.find(
            s => s.assignmentName.toLowerCase() === existing.assignmentName.toLowerCase()
          );
          return extracted ? { ...existing, ...extracted, classId: extracted.classId.replace(/(\w+)(\d+)/, '$1 $2') } : existing;
        });

        extractedAssignments.forEach(extracted => {
          if (!updatedAssignments.some(a => a.assignmentName.toLowerCase() === extracted.assignmentName.toLowerCase())) {
            updatedAssignments.push({
              ...extracted,
              classId: extracted.classId,
              complete: false,
              status: 0,
              timeNeeded: 0
            });
          }
        });

        return updatedAssignments;
      });

      toast({
        title: "Assignments Extracted",
        description: `${extractedAssignments.length} assignments added or updated.`,
        duration: 3000,
      })
    } catch (error) {
      console.error('Failed to extract assignments from image:', error)
      toast({
        title: "Error",
        description: "Failed to extract assignments from image. Please try again.",
        variant: "destructive",
        duration: 3000,
      })
    }
  }

  useEffect(() => {
    const div = document.getElementById('drag-file-element')
    div.addEventListener('dragenter', handleDragIn)
    div.addEventListener('dragleave', handleDragOut)
    div.addEventListener('dragover', handleDrag)
    div.addEventListener('drop', handleDrop)

    return () => {
      div.removeEventListener('dragenter', handleDragIn)
      div.removeEventListener('dragleave', handleDragOut)
      div.removeEventListener('dragover', handleDrag)
      div.removeEventListener('drop', handleDrop)
    }
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && e.shiftKey) {
        redo()
      } else if (e.key === 'z') {
        undo()
      }
    }
  }, [historyIndex])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  // Helper function to compare arrays
  const arraysEqual = (a, b) => 
    a.length === b.length && a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]))

  const sortedAssignments = assignments.sort((a, b) => {
    if (a.complete && b.complete) {
      // Sort by start date if both are completed
      return new Date(a.startDate) - new Date(b.startDate);
    } else if (!a.complete && !b.complete) {
      // Sort by end date if both are not completed
      return new Date(a.dueDate) - new Date(b.dueDate);
    } else {
      // Completed assignments go to the bottom
      return a.complete ? 1 : -1;
    }
  });

  const handleClearAssignments = () => {
    setAssignments([]);
    setHistory([]);
    setHistoryIndex(-1);
    Cookies.remove('assignments');
  }

  const handleAddClass = () => {
    if (newClass && !classes.includes(newClass)) {
      setClasses(prevClasses => [...prevClasses, newClass].sort())
      setNewClass('')
    }
  }

  return (
    <div 
      id="drag-file-element"
      className={`container mx-auto py-10 min-h-screen ${isDragging ? 'bg-gray-200' : ''}`}
    >
      {isDragging && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg">
            <p className="text-xl font-bold">Drop your image here</p>
          </div>
        </div>
      )}
      <div className="mb-4 flex space-x-2">
        <Input 
          value={courseInput} 
          onChange={(e) => setCourseInput(e.target.value)} 
          placeholder="Enter URL or raw text" 
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleExtractAssignments();
            }
          }}
        />
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={() => setCourseInput('')}
        />
        <Button onClick={() => fileInputRef.current.click()}>Upload Image</Button>
        <Button onClick={handleExtractAssignments}>Extract Assignments</Button>
      </div>
      <Button onClick={() => setShowForm(true)} className="mb-4">Add Assignment</Button>
      {showForm && (
        <div className="mb-4">
          <AssignmentForm 
            onSubmit={handleAddAssignment} 
            onCancel={() => setShowForm(false)}
            classes={classes}
          />
        </div>
      )}
      {editingIndex !== null && (
        <div className="mb-4">
          <AssignmentForm 
            onSubmit={handleEditAssignment} 
            initialData={assignments[editingIndex]}
            onCancel={() => setEditingIndex(null)}
            classes={classes}
          />
        </div>
      )}
      <div className="mb-4">
        <Button onClick={undo} disabled={historyIndex === 0} className="mr-2">Undo</Button>
        <Button onClick={redo} disabled={historyIndex === history.length - 1}>Redo</Button>
      </div>
      <Button onClick={handleClearAssignments} variant="destructive" className="mb-4">Clear All Assignments</Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button className="mb-4">Manage Classes</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Classes</DialogTitle>
          </DialogHeader>
          <div className="flex space-x-2 mb-4">
            <Input 
              value={newClass} 
              onChange={(e) => setNewClass(e.target.value)}
              placeholder="New class name"
            />
            <Button onClick={handleAddClass}>Add Class</Button>
          </div>
          <ul>
            {classes.map((classId) => (
              <li key={classId}>{classId}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <Table>
        <TableCaption>Assignment Tracker</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Due Date</TableHead>
            <TableHead>Time Needed (min)</TableHead>
            <TableHead>Class ID</TableHead>
            <TableHead>Assignment Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Complete?</TableHead>
            <TableHead>Release Date</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAssignments.map((assignment, index) => (
            <TableRow 
              key={index} 
              style={{ 
                backgroundColor: assignment.complete ? 'grey' : classColors[assignment.classId], 
                color: assignment.complete ? 'white' : 'white' // Change text color for better contrast
              }}
            >
              <TableCell className={assignment.complete ? 'line-through' : ''}>
                {formatDate(assignment.dueDate)}
              </TableCell>
              <TableCell>{assignment.timeNeeded}</TableCell>
              <TableCell>
                <Select 
                  value={assignment.classId} 
                  onValueChange={(value) => handleClassChange(index, value)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select Class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((classId) => (
                      <SelectItem key={classId} value={classId}>{classId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>{assignment.assignmentName}</TableCell>
              <TableCell>{`${assignment.status}%`}</TableCell>
              <TableCell>
                <Checkbox 
                  checked={assignment.complete} 
                  onCheckedChange={() => handleComplete(index)}
                />
              </TableCell>
              <TableCell>{formatDate(assignment.releaseDate)}</TableCell>
              <TableCell>
                <Button onClick={() => setEditingIndex(index)} className="mr-2">Edit</Button>
                <Button onClick={() => handleDeleteAssignment(index)} variant="destructive">Delete</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}