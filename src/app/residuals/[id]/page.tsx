"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/time-utils";
import { ArrowLeft } from "lucide-react";

interface ResidualCheck {
  _id: string;
  company: string;
  payrollHouse: string;
  checkNumber: string;
  checkDate: string;
  checkStatus: string;
  grossAmount: number;
  netAmount: number;
  receivedDate: string;
  prodTitleGrossAmt: number;
}

interface ProductionDetail {
  title: string;
  performerName: string;
  totalGross: number;
  totalNet: number;
  checkCount: number;
  checks: ResidualCheck[];
}

export default function ResidualProductionDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [detail, setDetail] = useState<ProductionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const id = params.id as string;
  const title = searchParams.get("title") || "";

  useEffect(() => {
    if (!title) {
      router.push("/residuals");
      return;
    }

    fetch(
      `/api/residuals/${id}/production?title=${encodeURIComponent(title)}`
    )
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not found");
      })
      .then((data) => setDetail(data))
      .catch(() => {
        router.push("/residuals");
      })
      .finally(() => setLoading(false));
  }, [id, title, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.push("/residuals")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Residuals
      </Button>

      {/* Production Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{detail.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {detail.performerName}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Gross</p>
              <p className="text-xl font-bold">
                {formatCurrency(detail.totalGross)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Net</p>
              <p className="text-xl font-bold">
                {formatCurrency(detail.totalNet)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Checks Received</p>
              <p className="text-xl font-bold">{detail.checkCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Check</p>
              <p className="text-xl font-bold">
                {detail.checkCount > 0
                  ? formatCurrency(detail.totalGross / detail.checkCount)
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checks Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check Date</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Net</TableHead>
                  <TableHead className="hidden md:table-cell">Received</TableHead>
                  <TableHead className="hidden md:table-cell">Company</TableHead>
                  <TableHead className="hidden lg:table-cell">Payroll House</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.checks.map((check) => (
                  <TableRow key={check._id}>
                    <TableCell className="font-medium">
                      {check.checkDate || "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(check.prodTitleGrossAmt)}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      {formatCurrency(check.netAmount)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {check.receivedDate || "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="truncate max-w-[200px] block">
                        {check.company || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="truncate max-w-[200px] block text-xs">
                        {check.payrollHouse || "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
