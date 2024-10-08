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
  const [assignments, setAssignments] = useState([]);
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showForm, setShowForm] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [classes, setClasses] = useState(() => {
    const storedClasses = Cookies.get('classes');
    return storedClasses ? JSON.parse(storedClasses) : [];
  });
  const [classColors, setClassColors] = useState({})
  const [courseInput, setCourseInput] = useState('')
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const [newClass, setNewClass] = useState('')
  const [isLoading, setIsLoading] = useState(false);
  const [sortColumn, setSortColumn] = useState('dueDate');
  const [sortOrder, setSortOrder] = useState('asc');

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
      Cookies.set('assignments', JSON.stringify(assignments), { expires: 365 });
      updateClasses(assignments);
    } else {
      Cookies.remove('assignments');
    }
  }, [assignments]);

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
    setIsLoading(true); // Set loading state to true
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
    } finally {
      setIsLoading(false); // Set loading state to false
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
    setIsLoading(true); // Set loading state to true
    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await axios.post('/api/extract-from-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const extractedAssignments = response.data;
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
      console.error('Failed to extract assignments from image:', error);
      toast({
        title: "Error",
        description: "Failed to extract assignments from image. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsLoading(false); // Set loading state to false
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

  const sortedAssignments = [...assignments].sort((a, b) => {
    // Always put completed items at the bottom
    if (a.complete !== b.complete) {
      return a.complete ? 1 : -1;
    }

    let compareA, compareB;

    switch (sortColumn) {
      case 'dueDate':
      case 'releaseDate':
        compareA = new Date(a[sortColumn]);
        compareB = new Date(b[sortColumn]);
        break;
      case 'timeNeeded':
      case 'status':
        compareA = Number(a[sortColumn]);
        compareB = Number(b[sortColumn]);
        break;
      default:
        compareA = a[sortColumn];
        compareB = b[sortColumn];
    }

    if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
    if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleClearAssignments = () => {
    setAssignments([]);
    setHistory([]);
    setHistoryIndex(-1);
    Cookies.remove('assignments');
  }

  const handleAddClass = () => {
    if (newClass && !classes.includes(newClass)) {
      const updatedClasses = [...classes, newClass].sort();
      setClasses(updatedClasses);
      Cookies.set('classes', JSON.stringify(updatedClasses)); // Store in cookies
      setNewClass('');
    }
  }

  // New function to handle deleting a class
  const handleDeleteClass = (classId) => {
    const updatedClasses = classes.filter(c => c !== classId);
    setClasses(updatedClasses);
    Cookies.set('classes', JSON.stringify(updatedClasses)); // Update cookies
  }

  // New function to handle editing a class
  const handleEditClass = (oldClassId, newClassId) => {
    if (newClassId && !classes.includes(newClassId)) {
      const updatedClasses = classes.map(c => (c === oldClassId ? newClassId : c));
      setClasses(updatedClasses);
      Cookies.set('classes', JSON.stringify(updatedClasses)); // Update cookies
    }
  }

  const handleSort = (column) => {
    if (column === sortColumn) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortOrder('asc');
    }
  };

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
      <h2 className="text-2xl font-bold mb-4">Nathan&apos;s Assignment Tracker</h2>
      <p className="mb-4">Enter a URL, raw text, or upload an image to extract assignments. Or add them manually.</p>
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
          disabled={isLoading} // Disable input while loading
        />
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={() => setCourseInput('')}
          disabled={isLoading} // Disable file input while loading
        />
        <Button onClick={() => fileInputRef.current.click()} disabled={isLoading}>Upload Image</Button>
        <Button onClick={handleExtractAssignments} disabled={isLoading}>
          {isLoading ? 'Processing...' : 'Extract Assignments'}
        </Button>
      </div>
      {isLoading && (
        <div className="mt-2 text-center text-blue-600">
          Processing your request... Please wait.
        </div>
      )}
      <div className="mb-4 flex justify-between">
        <div className="flex space-x-2">
          <Button onClick={handleClearAssignments} variant="destructive">Clear All Assignments</Button>
          <Button onClick={() => setShowForm(true)}>Add Assignment Manually</Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button>Manage Classes</Button>
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
                  <li key={classId} className="flex justify-between">
                    <span>{classId}</span>
                    <div>
                      <Button onClick={() => handleEditClass(classId, prompt("Edit class name:", classId))}>Edit</Button>
                      <Button onClick={() => handleDeleteClass(classId)} variant="destructive">Delete</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex space-x-2">
          <Button onClick={undo} disabled={historyIndex === 0} className="mr-2">Undo</Button>
          <Button onClick={redo} disabled={historyIndex === history.length - 1}>Redo</Button>
        </div>
      </div>
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
      <Table>
        <TableCaption>Assignment Tracker</TableCaption>
        <TableHeader>
          <TableRow>
            {[
              { key: 'dueDate', label: 'Due Date' },
              { key: 'timeNeeded', label: 'Time Needed (min)' },
              { key: 'classId', label: 'Class ID' },
              { key: 'assignmentName', label: 'Assignment Name' },
              { key: 'status', label: 'Status' },
              { key: 'complete', label: 'Complete?' },
              { key: 'releaseDate', label: 'Release Date' },
            ].map(({ key, label }) => (
              <TableHead key={key} onClick={() => handleSort(key)} className="cursor-pointer">
                {label}
                {sortColumn === key && (
                  <span className="ml-1">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                )}
              </TableHead>
            ))}
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAssignments.map((assignment, index) => (
            <TableRow 
              key={index} 
              style={{ 
                backgroundColor: assignment.complete ? 'grey' : classColors[assignment.classId], 
                color: assignment.complete ? 'white' : 'white'
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
                  className="flex items-center justify-center"
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