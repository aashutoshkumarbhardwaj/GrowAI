import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { UploadCloud, FileType, CheckCircle2, AlertCircle, Loader2, ArrowRight, X } from "lucide-react"
import { useParseCSV, useImportCSV } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { ParsedCSV, ImportResult } from "@workspace/api-client-react"

type Step = "UPLOAD" | "PREVIEW" | "LOADING" | "RESULTS" | "ERROR"

export default function Home() {
  const [step, setStep] = useState<Step>("UPLOAD")
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedCSV | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const parseCSV = useParseCSV()
  const importCSV = useImportCSV()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    
    if (selectedFile.type !== "text/csv" && !selectedFile.name.endsWith(".csv")) {
      setErrorMessage("Please upload a valid CSV file.")
      return
    }
    
    setFile(selectedFile)
    setErrorMessage(null)
    
    try {
      const text = await selectedFile.text()
      const result = await parseCSV.mutateAsync({
        data: { csvText: text }
      })
      setParsedData(result)
      setStep("PREVIEW")
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to parse CSV file.")
      setFile(null)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Re-use the input logic
      if (fileInputRef.current) {
        fileInputRef.current.files = e.dataTransfer.files
        handleFileChange({ target: fileInputRef.current } as any)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleConfirmImport = async () => {
    if (!parsedData) return
    
    setStep("LOADING")
    
    try {
      const result = await importCSV.mutateAsync({
        data: {
          rows: parsedData.rows,
          columns: parsedData.columns
        }
      })
      setImportResult(result)
      setStep("RESULTS")
    } catch (err: any) {
      setStep("ERROR")
      setErrorMessage(err.message || "An error occurred during AI extraction. If OPENAI_API_KEY is missing, please configure it.")
    }
  }

  const resetProcess = () => {
    setStep("UPLOAD")
    setFile(null)
    setParsedData(null)
    setImportResult(null)
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const getStatusBadge = (status?: string | null) => {
    if (!status) return <span className="text-muted-foreground">-</span>
    
    switch (status) {
      case "GOOD_LEAD_FOLLOW_UP":
        return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-500/20">Follow Up</Badge>
      case "SALE_DONE":
        return <Badge className="bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 border-blue-500/20">Sale Done</Badge>
      case "DID_NOT_CONNECT":
        return <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border-amber-500/20">No Connect</Badge>
      case "BAD_LEAD":
        return <Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/25 border-red-500/20">Bad Lead</Badge>
      default:
        return <Badge variant="outline">{status.replace(/_/g, ' ')}</Badge>
    }
  }

  const renderUpload = () => (
    <motion.div
      key="upload"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto w-full"
    >
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight mb-3">Upload your dirty data.</h1>
        <p className="text-lg text-muted-foreground">
          Drop your raw CSV export. Our AI will clean, structure, and map it into perfect CRM leads.
        </p>
      </div>

      <Card className="border-2 border-dashed bg-card/50 hover:bg-card/80 transition-colors duration-200">
        <CardContent className="p-0">
          <div 
            className="flex flex-col items-center justify-center p-12 py-20 cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            data-testid="zone-upload"
          >
            <div className="bg-primary/10 p-4 rounded-full mb-6">
              <UploadCloud className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Click or drag and drop</h3>
            <p className="text-muted-foreground text-sm mb-6 text-center max-w-sm">
              Upload any CSV file. Don't worry about the columns — AI will figure out what goes where.
            </p>
            <Button variant="secondary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
              Select File
            </Button>
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
              data-testid="input-file"
            />
          </div>
        </CardContent>
      </Card>
      
      {errorMessage && (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </motion.div>
  )

  const renderPreview = () => (
    <motion.div
      key="preview"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="w-full flex flex-col h-[calc(100vh-140px)]"
    >
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <FileType className="w-6 h-6 text-primary" />
            {file?.name}
          </h2>
          <p className="text-muted-foreground">
            {parsedData?.totalRows} rows found. Review the raw data before AI processing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={resetProcess} data-testid="button-cancel-preview">Cancel</Button>
          <Button onClick={handleConfirmImport} className="gap-2" data-testid="button-confirm-import">
            Extract Leads <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col border-border/50 shadow-md">
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[50px] bg-muted/50">#</TableHead>
                {parsedData?.columns.map((col, i) => (
                  <TableHead key={i} className="font-mono text-xs text-muted-foreground bg-muted/50">{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsedData?.rows.map((row, i) => (
                <TableRow key={i} className="group">
                  <TableCell className="text-muted-foreground/50 font-mono text-xs">{i + 1}</TableCell>
                  {parsedData.columns.map((col, j) => (
                    <TableCell key={j} className="max-w-[200px] truncate text-sm" title={row[col]}>
                      {row[col] || <span className="text-muted-foreground/30">-</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </motion.div>
  )

  const renderLoading = () => (
    <motion.div
      key="loading"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4 }}
      className="max-w-md mx-auto w-full text-center mt-20"
    >
      <div className="relative w-24 h-24 mx-auto mb-8">
        <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-pulse" />
        </div>
      </div>
      <h2 className="text-2xl font-bold tracking-tight mb-2">AI is working its magic</h2>
      <p className="text-muted-foreground mb-8">
        Extracting names, cleaning phone numbers, and identifying lead status...
      </p>
      <Progress value={65} className="h-2 w-full max-w-xs mx-auto" />
    </motion.div>
  )

  const renderError = () => (
    <motion.div
      key="error"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-xl mx-auto w-full mt-10"
    >
      <Card className="border-destructive/50 shadow-lg shadow-destructive/10">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto bg-destructive/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Extraction Failed</CardTitle>
          <CardDescription>Something went wrong during the AI processing.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 p-4 rounded-lg text-sm font-mono text-muted-foreground border border-border/50 break-words">
            {errorMessage}
          </div>
        </CardContent>
        <CardFooter className="flex justify-center gap-4 pt-2">
          <Button variant="outline" onClick={resetProcess} data-testid="button-start-over">Start Over</Button>
          <Button onClick={handleConfirmImport} data-testid="button-retry">Try Again</Button>
        </CardFooter>
      </Card>
    </motion.div>
  )

  const renderResults = () => {
    if (!importResult) return null

    return (
      <motion.div
        key="results"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4 }}
        className="w-full flex flex-col h-[calc(100vh-140px)]"
      >
        <div className="flex items-center justify-between mb-8 flex-shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-emerald-500/15 p-1.5 rounded-full">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">Extraction Complete</h2>
            </div>
            <p className="text-muted-foreground flex items-center gap-4">
              <span><strong>{importResult.imported}</strong> imported</span>
              <span className="w-1 h-1 rounded-full bg-border"></span>
              <span><strong>{importResult.skipped}</strong> skipped</span>
              <span className="w-1 h-1 rounded-full bg-border"></span>
              <span><strong>{importResult.total}</strong> total</span>
            </p>
          </div>
          <Button onClick={resetProcess} variant="outline" data-testid="button-import-another">
            Import Another File
          </Button>
        </div>

        <Tabs defaultValue="imported" className="flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-4">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="imported" data-testid="tab-imported">
                Imported ({importResult.imported})
              </TabsTrigger>
              <TabsTrigger value="skipped" data-testid="tab-skipped">
                Skipped ({importResult.skipped})
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="imported" className="flex-1 mt-0 min-h-0 data-[state=active]:flex flex-col border rounded-xl overflow-hidden shadow-sm bg-card">
            <div className="flex-1 overflow-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importResult.records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No records were successfully imported.
                      </TableCell>
                    </TableRow>
                  ) : (
                    importResult.records.map((record, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="font-medium text-foreground">{record.name || '-'}</div>
                          <div className="text-xs text-muted-foreground">{record.company || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{record.email || '-'}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {record.country_code ? `+${record.country_code} ` : ''}
                            {record.mobile_without_country_code || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {[record.city, record.state, record.country].filter(Boolean).join(', ') || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(record.crm_status)}
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate text-sm text-muted-foreground" title={record.crm_note || undefined}>
                          {record.crm_note || '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          
          <TabsContent value="skipped" className="flex-1 mt-0 min-h-0 data-[state=active]:flex flex-col border rounded-xl overflow-hidden shadow-sm bg-card">
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <X className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No Skipped Records</h3>
              <p className="text-muted-foreground max-w-sm">
                The AI was able to successfully map all rows in your CSV.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    )
  }

  return (
    <div className="layout-container flex flex-col items-center justify-center min-h-[calc(100dvh-73px)]">
      <AnimatePresence mode="wait" className="w-full">
        {step === "UPLOAD" && renderUpload()}
        {step === "PREVIEW" && renderPreview()}
        {step === "LOADING" && renderLoading()}
        {step === "ERROR" && renderError()}
        {step === "RESULTS" && renderResults()}
      </AnimatePresence>
    </div>
  )
}
